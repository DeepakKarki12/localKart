import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import {
  Shop,
  Product,
  Order,
  AuditLog,
  Subscription,
  PlatformSettings,
  CatalogProduct,
  SecurityEvent,
} from "../models/marketplace.js";
import { User, publicUser } from "../models/User.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { fail, objectId, paged, escaped } from "../utils/http.js";
import { deliverySchema, paise } from "../validators/marketplace.js";
import { audit } from "../services/audit.js";
import { shopAnalytics } from "../services/analytics.js";
export function adminRoutes(env) {
  const router = Router();
  router.use(authenticate(env.JWT_SECRET), requireRole("admin"));
  router.get("/dashboard", async (req, res) => {
    const [
      stores,
      activeStores,
      pendingApprovals,
      customers,
      orders,
      completed,
      totals,
      subscriptions,
    ] = await Promise.all([
      Shop.countDocuments(),
      Shop.countDocuments({ approvalStatus: "APPROVED", active: true }),
      Shop.countDocuments({ approvalStatus: "PENDING_APPROVAL" }),
      User.countDocuments({ role: "customer" }),
      Order.countDocuments(),
      Order.countDocuments({ orderStatus: "COMPLETED" }),
      Order.aggregate([
        { $match: { orderStatus: "COMPLETED" } },
        {
          $group: {
            _id: null,
            gmv: { $sum: "$subtotal" },
            platformRevenue: { $sum: "$platformFee" },
            deliveryFees: { $sum: "$deliveryFee" },
          },
        },
      ]),
      Subscription.aggregate([
        { $match: { status: "ACTIVE" } },
        { $group: { _id: null, configuredAmount: { $sum: "$amount" } } },
      ]),
    ]);
    res.json({
      stores,
      activeStores,
      pendingApprovals,
      customers,
      orders,
      completed,
      gmv: totals[0]?.gmv || 0,
      platformRevenue: totals[0]?.platformRevenue || 0,
      deliveryFees: totals[0]?.deliveryFees || 0,
      configuredSubscriptions: subscriptions[0]?.configuredAmount || 0,
    });
  });
  router.get("/shops", async (req, res) => {
    const filter = {};
    if (req.query.status) filter.approvalStatus = String(req.query.status);
    if (req.query.search)
      filter.name = new RegExp(
        escaped(String(req.query.search).slice(0, 100)),
        "i",
      );
    res.json(
      await paged(Shop, filter, req.query, {
        select: "+verificationNotes",
        populate: { path: "ownerId", select: "name email phone" },
      }),
    );
  });
  router.get("/shops/:id", async (req, res) => {
    const shop = await Shop.findById(objectId(req.params.id))
      .select("+verificationNotes")
      .populate("ownerId", "name email phone");
    if (!shop) fail(404, "Store not found.");
    res.json({ shop });
  });
  router.patch("/shops/:id/approval", async (req, res) => {
    const values = z
      .object({
        status: z.enum(["APPROVED", "REJECTED", "SUSPENDED"]),
        notes: z.string().trim().min(3).max(2000),
        physicallyVerified: z.boolean().optional(),
      })
      .strict()
      .parse(req.body);
    if (values.status === "APPROVED" && !values.physicallyVerified)
      fail(400, "Confirm that the physical verification was completed.");
    let shop;
    await mongoose.connection.transaction(async (session) => {
      shop = await Shop.findById(objectId(req.params.id)).session(session);
      if (!shop) fail(404, "Store not found.");
      shop.approvalStatus = values.status;
      shop.active = values.status === "APPROVED";
      shop.verificationNotes = values.notes;
      shop.rejectionReason =
        values.status === "REJECTED" ? values.notes : undefined;
      await shop.save({ session });
      await audit(req.user, `SHOP_${values.status}`, shop, values, session);
    });
    res.json({ shop });
  });
  router.patch("/shops/:id/delivery", async (req, res) => {
    const { deliveryEnabled, ...settings } = deliverySchema.parse(req.body);
    let shop;
    await mongoose.connection.transaction(async (session) => {
      shop = await Shop.findById(objectId(req.params.id)).session(session);
      if (!shop) fail(404, "Store not found.");
      shop.deliveryEnabled = deliveryEnabled;
      shop.deliverySettings = settings;
      await shop.save({ session });
      await audit(
        req.user,
        "DELIVERY_CONFIG",
        shop,
        { deliveryEnabled, ...settings },
        session,
      );
    });
    res.json({ shop });
  });
  router.get("/orders", async (req, res) => {
    const filter = {};
    if (req.query.shopId) filter.shopId = objectId(req.query.shopId);
    if (req.query.status) filter.orderStatus = String(req.query.status);
    res.json(
      await paged(Order, filter, req.query, {
        populate: { path: "shopId", select: "name" },
      }),
    );
  });
  router.get("/products", async (req, res) => {
    const filter = req.query.shopId
      ? { shopId: objectId(req.query.shopId) }
      : {};
    res.json(
      await paged(Product, filter, req.query, {
        populate: [
          { path: "shopId", select: "name" },
          { path: "catalogId", select: "image name" },
        ],
      }),
    );
  });
  router.get("/users", async (req, res) => {
    const filter = {};
    if (req.query.role) filter.role = String(req.query.role);
    if (req.query.search)
      filter.email = new RegExp(
        escaped(String(req.query.search).slice(0, 100)),
        "i",
      );
    const result = await paged(User, filter, req.query);
    res.json({ ...result, items: result.items.map(publicUser) });
  });
  router.patch("/users/:id/status", async (req, res) => {
    const values = z
      .object({
        accountStatus: z.enum(["active", "suspended"]),
        reason: z.string().trim().min(3).max(1000),
      })
      .strict()
      .parse(req.body);
    let user;
    await mongoose.connection.transaction(async (session) => {
      user = await User.findById(objectId(req.params.id)).session(session);
      if (!user) fail(404, "User not found.");
      if (user.role === "admin")
        fail(
          403,
          "Administrator accounts cannot be changed through this endpoint.",
        );
      user.accountStatus = values.accountStatus;
      await user.save({ session });
      if (user.role === "shopkeeper" && values.accountStatus === "suspended") {
        const shop = await Shop.findOne({ ownerId: user._id }).session(session);
        if (shop) {
          shop.active = false;
          shop.approvalStatus = "SUSPENDED";
          await shop.save({ session });
          await audit(
            req.user,
            "SHOP_SUSPENDED",
            shop,
            { reason: "Owner account suspended" },
            session,
          );
        }
      }
      await audit(req.user, "USER_STATUS", user, values, session);
    });
    if (values.accountStatus === "suspended")
      req.app.get("io")?.in(user.id).disconnectSockets(true);
    res.json({ user: publicUser(user) });
  });
  router.get("/security", async (req, res) =>
    res.json(
      await paged(SecurityEvent, {}, req.query, {
        populate: { path: "userId", select: "email name" },
      }),
    ),
  );
  router.post("/orders/:id/dispute", async (req, res) => {
    const values = z
      .object({ resolution: z.string().trim().min(5).max(2000) })
      .strict()
      .parse(req.body);
    await mongoose.connection.transaction(async (session) => {
      const order = await Order.findById(objectId(req.params.id)).session(
        session,
      );
      if (!order) fail(404, "Order not found.");
      await audit(req.user, "DISPUTE_RESOLVED", order, values, session);
    });
    res.json({ recorded: true });
  });
  router.get("/audit", async (req, res) =>
    res.json(
      await paged(AuditLog, {}, req.query, {
        populate: { path: "actorId", select: "name email" },
      }),
    ),
  );
  router.get("/subscriptions", async (req, res) =>
    res.json(
      await paged(Subscription, {}, req.query, {
        populate: { path: "shopId", select: "name" },
      }),
    ),
  );
  router.get("/shops/:id/subscription", async (req, res) =>
    res.json({
      subscription: await Subscription.findOne({
        shopId: objectId(req.params.id),
      }),
    }),
  );
  router.put("/shops/:id/subscription", async (req, res) => {
    const values = z
      .object({
        plan: z.string().min(1).max(100),
        amount: paise,
        status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED"]),
        startDate: z.iso.datetime(),
        endDate: z.iso.datetime(),
      })
      .strict()
      .refine(
        (v) => new Date(v.endDate) > new Date(v.startDate),
        "End date must be after start date.",
      )
      .parse(req.body);
    let subscription;
    await mongoose.connection.transaction(async (session) => {
      const shop = await Shop.findById(objectId(req.params.id)).session(
        session,
      );
      if (!shop) fail(404, "Store not found.");
      subscription = await Subscription.findOneAndUpdate(
        { shopId: shop._id },
        { $set: values },
        { upsert: true, new: true, session },
      );
      await audit(
        req.user,
        "SUBSCRIPTION_CONFIG",
        subscription,
        values,
        session,
      );
    });
    res.json({ subscription });
  });
  router.get("/settings", async (req, res) =>
    res.json({
      settings: (await PlatformSettings.findOne({ key: "platform" })) || {
        platformFeeBps: 0,
        supportEmail: "",
        notice: "",
      },
    }),
  );
  router.patch("/settings", async (req, res) => {
    const values = z
      .object({
        supportEmail: z.email(),
        platformFeeBps: z.number().int().min(0).max(3000),
        notice: z.string().max(500),
      })
      .strict()
      .parse(req.body);
    let settings;
    await mongoose.connection.transaction(async (session) => {
      settings = await PlatformSettings.findOneAndUpdate(
        { key: "platform" },
        { $set: values },
        { upsert: true, new: true, session },
      );
      await audit(req.user, "PLATFORM_SETTINGS", settings, values, session);
    });
    res.json({ settings });
  });
  router.post("/catalog", async (req, res) => {
    const values = catalogSchema.parse(req.body);
    let item;
    await mongoose.connection.transaction(async (session) => {
      [item] = await CatalogProduct.create([values], { session });
      await audit(req.user, "CATALOG_CREATE", item, {}, session);
    });
    res.status(201).json({ item });
  });
  router.patch("/catalog/:id", async (req, res) => {
    const values = catalogSchema.parse(req.body);
    let item;
    await mongoose.connection.transaction(async (session) => {
      item = await CatalogProduct.findByIdAndUpdate(
        objectId(req.params.id),
        { $set: values },
        { new: true, session },
      );
      if (!item) fail(404, "Catalog item not found.");
      await audit(req.user, "CATALOG_EDIT", item, values, session);
    });
    res.json({ item });
  });
  return router;
}
const catalogSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    unit: z.string().min(1).max(100),
    description: z.string().max(2000).default(""),
    barcode: z
      .string()
      .regex(/^\d{8,14}$/)
      .optional(),
  })
  .strict();
export function analyticsRoutes(env) {
  const router = Router();
  router.get(
    "/shops/:shopId/analytics",
    authenticate(env.JWT_SECRET),
    async (req, res) => {
      const { ownShop } = await import("../middleware/ownership.js");
      await ownShop(req.user, req.params.shopId);
      res.json(await shopAnalytics(req.params.shopId));
    },
  );
  return router;
}
