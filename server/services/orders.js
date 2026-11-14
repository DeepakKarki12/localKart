import { openingState } from "../../shared/opening-hours.js";
import crypto from "node:crypto";
import mongoose from "mongoose";
import {
  Order,
  Product,
  Shop,
  PlatformSettings,
} from "../models/marketplace.js";
import { fail } from "../utils/http.js";
import { hashCode, encryptCode } from "./crypto.js";
import { orderNotifications } from "./notifications.js";
import { audit } from "./audit.js";
export const transitions = {
  PENDING: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "CANCELLED"],
  READY_FOR_PICKUP: ["COMPLETED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};
export const isShopOpen = (shop, now) => openingState(shop, now).open;
export async function createOrder(
  user,
  values,
  idempotencyKey,
  secret,
  preview = false,
) {
  let order;
  await mongoose.connection.transaction(async (session) => {
    const existing = preview
      ? null
      : await Order.findOne({ customerId: user.id, idempotencyKey }).session(
          session,
        );
    if (existing) {
      order = existing;
      return;
    }
    const shop = await Shop.findById(values.shopId).session(session);
    if (!shop || shop.approvalStatus !== "APPROVED" || !shop.active)
      fail(400, "Store is not currently accepting orders.");
    if (shop.businessType && shop.businessType !== "RETAIL")
      fail(400, "Use the booking section for this business.");
    if (!isShopOpen(shop))
      fail(400, "Store is closed. Please try during opening hours.");
    // Touch store to conflict safely with simultaneous suspension/delivery settings changes.
    if (!preview) {
      shop.revision += 1;
      await shop.save({ session });
    }
    if (values.fulfillmentMethod === "pickup" && !shop.pickupEnabled)
      fail(400, "Pickup is not available.");
    const items = [];
    for (const item of values.items) {
      const product = await Product.findOne({
        _id: item.productId,
        shopId: shop._id,
        active: true,
      }).session(session);
      if (!product || product.availabilityStatus === "OUT_OF_STOCK")
        fail(409, "A product is unavailable. Refresh your cart.");
      if (
        product.inventoryTrackingEnabled &&
        product.stockQuantity < item.quantity
      )
        fail(409, `${product.name} has insufficient stock.`);
      items.push({
        productId: product._id,
        name: product.name,
        unit: product.unit,
        price: product.price,
        quantity: item.quantity,
        inventoryTracked: product.inventoryTrackingEnabled,
      });
      // All products are written so concurrent edits, archiving and price changes conflict.
      if (!preview) {
        if (product.inventoryTrackingEnabled)
          product.stockQuantity -= item.quantity;
        product.revision += 1;
        await product.save({ session });
      }
    }
    const subtotal = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    let deliveryFee = 0;
    if (values.fulfillmentMethod === "delivery") {
      if (!shop.deliveryEnabled)
        fail(400, "Delivery is disabled for this store.");
      if (
        !values.deliveryAddress ||
        !shop.deliverySettings.serviceablePinCodes.includes(
          values.deliveryAddress.pinCode,
        )
      )
        fail(400, "This delivery PIN code is not serviceable.");
      if (subtotal < shop.deliverySettings.minimumOrderAmount)
        fail(400, "The delivery minimum order amount has not been reached.");
      if (
        !shop.deliverySettings.deliveryTimeSlots.includes(values.deliveryWindow)
      )
        fail(400, "Choose a configured delivery window.");
      deliveryFee = shop.deliverySettings.deliveryFee;
      if (values.paymentMethod !== "CASH_ON_DELIVERY")
        fail(400, "Choose cash on delivery.");
    } else if (values.paymentMethod !== "PAY_AT_STORE")
      fail(400, "Choose pay at store for pickup.");
    const settings = await PlatformSettings.findOne({
      key: "platform",
    }).session(session);
    if (
      !preview &&
      values.expectedTotalAmount != null &&
      values.expectedTotalAmount !== subtotal + deliveryFee
    )
      fail(
        409,
        "Prices or delivery fees changed. Review current prices again before submitting.",
      );
    if (preview) {
      order = {
        items,
        subtotal,
        deliveryFee,
        totalAmount: subtotal + deliveryFee,
      };
      return;
    }
    const pickupCode = String(crypto.randomInt(100000, 1000000));
    [order] = await Order.create(
      [
        {
          ...values,
          customerId: user.id,
          items,
          orderNumber: `LC-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
          subtotal,
          deliveryFee,
          totalAmount: subtotal + deliveryFee,
          platformFee: Math.round(
            (subtotal * (settings?.platformFeeBps || 0)) / 10000,
          ),
          deliveryAddress:
            values.fulfillmentMethod === "delivery"
              ? values.deliveryAddress
              : undefined,
          deliveryWindow:
            values.fulfillmentMethod === "delivery"
              ? values.deliveryWindow
              : undefined,
          pickupCodeHash:
            values.fulfillmentMethod === "pickup"
              ? hashCode(pickupCode, secret)
              : undefined,
          pickupCodeEncrypted:
            values.fulfillmentMethod === "pickup"
              ? encryptCode(pickupCode, secret)
              : undefined,
          idempotencyKey,
          statusHistory: [
            { status: "PENDING", actorId: user.id, at: new Date() },
          ],
        },
      ],
      { session },
    );
    await orderNotifications(order, session, true);
  });
  return order;
}
export async function changeOrder(user, orderId, status, reason, code, secret) {
  let order;
  await mongoose.connection.transaction(async (session) => {
    order = await Order.findById(orderId)
      .select("+pickupCodeHash")
      .session(session);
    if (!order) fail(404, "Order not found.");
    const shop = await Shop.findById(order.shopId).session(session);
    const isCustomer =
      user.role === "customer" && String(order.customerId) === user.id;
    const isOwner =
      user.role === "shopkeeper" && String(shop.ownerId) === user.id;
    if (!isCustomer && !isOwner && user.role !== "admin")
      fail(403, "You cannot manage this order.");
    if (
      isCustomer &&
      (order.orderStatus !== "PENDING" || status !== "CANCELLED")
    )
      fail(403, "Customers can cancel only pending orders.");
    if (isOwner && (shop.approvalStatus !== "APPROVED" || !shop.active))
      fail(403, "Store access is suspended. Contact the administrator.");
    if (!transitions[order.orderStatus].includes(status))
      fail(409, `Cannot move ${order.orderStatus} to ${status}.`);
    if (["REJECTED", "CANCELLED"].includes(status) && !reason?.trim())
      fail(400, "Provide a reason.");
    if (user.role === "admin" && !reason?.trim())
      fail(400, "Administrative changes require an audit reason.");
    if (status === "READY_FOR_PICKUP" && order.fulfillmentMethod !== "pickup")
      fail(400, "This is a delivery order.");
    if (status === "OUT_FOR_DELIVERY" && order.fulfillmentMethod !== "delivery")
      fail(400, "This is a pickup order.");
    if (status === "COMPLETED" && order.fulfillmentMethod === "pickup") {
      if (
        !code ||
        !/^\d{6}$/.test(code) ||
        !crypto.timingSafeEqual(
          Buffer.from(hashCode(code, secret), "hex"),
          Buffer.from(order.pickupCodeHash, "hex"),
        )
      )
        fail(400, "Invalid pickup verification code.");
      order.pickupVerifiedAt = new Date();
    }
    if (["CANCELLED", "REJECTED"].includes(status)) {
      for (const item of order.items)
        if (item.inventoryTracked)
          await Product.updateOne(
            { _id: item.productId },
            { $inc: { stockQuantity: item.quantity } },
            { session },
          );
    }
    order.orderStatus = status;
    if (status === "REJECTED") order.rejectionReason = reason;
    if (status === "CANCELLED") order.cancellationReason = reason;
    if (status === "COMPLETED") order.paymentStatus = "PAID";
    order.statusHistory.push({
      status,
      actorId: user.id,
      reason,
      at: new Date(),
    });
    await order.save({ session });
    await orderNotifications(order, session);
    if (user.role === "admin")
      await audit(user, "ORDER_CORRECTION", order, { status, reason }, session);
  });
  return order;
}
