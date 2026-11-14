import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { Order, Shop } from "../models/marketplace.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { ownShop } from "../middleware/ownership.js";
import { fail, objectId, paged } from "../utils/http.js";
import { orderSchema } from "../validators/marketplace.js";
import { createOrder, changeOrder } from "../services/orders.js";
import { decryptCode } from "../services/crypto.js";
import { broadcastOrder } from "../services/notifications.js";
export function ordersRoutes(env) {
  const router = Router();
  router.use(
    ["/orders", "/shops/:shopId/orders"],
    authenticate(env.JWT_SECRET),
  );
  router.post("/orders/quote", requireRole("customer"), async (req, res) => {
    const values = orderSchema.parse(req.body);
    const quote = await createOrder(
      req.user,
      values,
      null,
      env.JWT_SECRET,
      true,
    );
    res.json({ quote });
  });
  router.post("/orders", requireRole("customer"), async (req, res) => {
    const values = orderSchema.parse(req.body);
    const key = z.string().min(16).max(100).parse(req.get("Idempotency-Key"));
    let order;
    try {
      order = await createOrder(
        req.user,
        values,
        key,
        env.PICKUP_ENCRYPTION_SECRET || env.JWT_SECRET,
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      order = await Order.findOne({
        customerId: req.user.id,
        idempotencyKey: key,
      });
      if (!order) throw error;
    }
    await broadcastOrder(req.app.get("io"), order.id);
    res.status(201).json({ order: safeOrder(order) });
  });
  router.get("/orders/my", requireRole("customer"), async (req, res) =>
    res.json(
      await paged(Order, { customerId: req.user.id }, req.query, {
        populate: { path: "shopId", select: "name slug" },
      }),
    ),
  );
  router.get(
    "/shops/:shopId/orders",
    requireRole("shopkeeper", "admin"),
    async (req, res) => {
      await ownShop(req.user, req.params.shopId);
      const filter = { shopId: req.params.shopId };
      const pastStatuses = ["COMPLETED", "REJECTED", "CANCELLED"];
      if (req.query.section === "incoming") {
        filter.orderStatus = mongoose.trusted({ $nin: pastStatuses });
      } else if (req.query.section === "past") {
        filter.orderStatus = mongoose.trusted({ $in: pastStatuses });
      } else if (req.query.status)
        filter.orderStatus = String(req.query.status);
      res.json(
        await paged(Order, filter, req.query, {
          sort:
            req.query.sort === "oldest"
              ? { createdAt: 1, _id: 1 }
              : { createdAt: -1, _id: -1 },
        }),
      );
    },
  );
  router.get("/orders/:id", async (req, res) => {
    const order = await Order.findById(objectId(req.params.id)).select(
      "+pickupCodeEncrypted",
    );
    if (!order) fail(404, "Order not found.");
    const shop = await Shop.findById(order.shopId);
    if (
      req.user.role !== "admin" &&
      String(order.customerId) !== req.user.id &&
      !(req.user.role === "shopkeeper" && String(shop.ownerId) === req.user.id)
    )
      fail(403, "This order belongs to another account.");
    const result = safeOrder(order);
    if (
      String(order.customerId) === req.user.id &&
      order.fulfillmentMethod === "pickup" &&
      !["CANCELLED", "REJECTED", "COMPLETED"].includes(order.orderStatus)
    )
      result.pickupCode = decryptCode(
        order.pickupCodeEncrypted,
        env.PICKUP_ENCRYPTION_SECRET || env.JWT_SECRET,
      );
    res.set("Cache-Control", "no-store").json({ order: result });
  });
  const attempts = rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => `${req.user.id}:${req.params.id}`,
  });
  const statusLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 200,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => req.user.id,
  });
  router.patch("/orders/:id/status", statusLimit, async (req, res) => {
    const values = z
      .object({
        status: z.enum([
          "ACCEPTED",
          "PREPARING",
          "READY_FOR_PICKUP",
          "OUT_FOR_DELIVERY",
          "COMPLETED",
          "REJECTED",
          "CANCELLED",
        ]),
        reason: z.string().max(1000).optional(),
      })
      .strict()
      .parse(req.body);
    const order = await changeOrder(
      req.user,
      objectId(req.params.id),
      values.status,
      values.reason,
    );
    await broadcastOrder(req.app.get("io"), order.id);
    res.json({ order: safeOrder(order) });
  });
  router.post(
    "/orders/:id/verify-pickup",
    attempts,
    requireRole("shopkeeper", "admin"),
    async (req, res) => {
      const values = z
        .object({
          code: z.string().regex(/^\d{6}$/),
          reason: z.string().max(1000).optional(),
        })
        .strict()
        .parse(req.body);
      const order = await changeOrder(
        req.user,
        objectId(req.params.id),
        "COMPLETED",
        values.reason,
        values.code,
        env.PICKUP_ENCRYPTION_SECRET || env.JWT_SECRET,
      );
      await broadcastOrder(req.app.get("io"), order.id);
      res.json({ order: safeOrder(order) });
    },
  );
  return router;
}
function safeOrder(order) {
  const value = order.toObject();
  delete value.pickupCodeHash;
  delete value.pickupCodeEncrypted;
  return value;
}
