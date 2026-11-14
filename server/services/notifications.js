import { Notification, Shop, Order } from "../models/marketplace.js";
export async function orderNotifications(order, session, created = false) {
  const shop = await Shop.findById(order.shopId).session(session);
  const recipients = created
    ? [shop.ownerId]
    : [order.customerId, shop.ownerId];
  await Notification.create(
    recipients.map((recipientId) => ({
      recipientId,
      orderId: order._id,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      type: created ? "NEW_ORDER" : "ORDER_STATUS",
      message: created
        ? `New order ${order.orderNumber} needs confirmation.`
        : `${order.orderNumber}: ${order.orderStatus.replaceAll("_", " ").toLowerCase()}.`,
    })),
    { session, ordered: true },
  );
}
export async function broadcastOrder(io, orderId) {
  if (!io) return;
  try {
    const order = await Order.findById(orderId);
    const shop = await Shop.findById(order.shopId);
    for (const userId of [order.customerId, shop.ownerId])
      io.to(String(userId)).emit("orders:changed", { orderId: order.id });
  } catch (error) {
    console.error("Socket notification failed:", error.name);
  } // Polling reads the durable notifications instead.
}
