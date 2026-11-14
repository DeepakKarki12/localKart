import { Router } from "express";
import crypto from "node:crypto";
import mongoose from "mongoose";
import {
  Shop,
  Category,
  Product,
  CatalogProduct,
  Order,
} from "../models/marketplace.js";
import { User } from "../models/User.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { ownShop, publicShop } from "../middleware/ownership.js";
import {
  applicationSchema,
  shopSettingsSchema,
  categorySchema,
  productSchema,
  id,
} from "../validators/marketplace.js";
import { fail, objectId, paged, slugify, escaped } from "../utils/http.js";
import { audit } from "../services/audit.js";
import { z } from "zod";
import { ClassSession, BarberTicket } from "../models/bookings.js";
export const liveShopFilter = { approvalStatus: "APPROVED", active: true };
export function shopsRoutes(env) {
  const router = Router();
  const auth = authenticate(env.JWT_SECRET);
  router.post(
    "/shops/apply",
    auth,
    requireRole("customer", "shopkeeper"),
    async (req, res) => {
      const values = applicationSchema.parse(req.body);
      let shop;
      await mongoose.connection.transaction(async (session) => {
        if (await Shop.exists({ ownerId: req.user.id }).session(session))
          fail(409, "You already have a store application.");
        [shop] = await Shop.create(
          [
            {
              ...values,
              ownerId: req.user.id,
              slug: `${slugify(values.name)}-${crypto.randomBytes(3).toString("hex")}`,
            },
          ],
          { session },
        );
        await User.updateOne(
          { _id: req.user.id },
          { $set: { role: "shopkeeper" } },
          { session },
        );
      });
      res.status(201).json({ shop });
    },
  );
  router.get(
    "/shops/mine",
    auth,
    requireRole("shopkeeper", "admin"),
    async (req, res) =>
      res.json({ shop: await Shop.findOne({ ownerId: req.user.id }) }),
  );
  router.get("/shops", async (req, res) => {
    const filter = { ...liveShopFilter };
    if (req.query.businessType)
      filter.businessType = z
        .enum(["RETAIL", "CLASSES", "BARBER"])
        .parse(req.query.businessType);
    if (req.query.pinCode) {
      const pinCode = z
        .string()
        .regex(/^[1-9]\d{5}$/)
        .parse(req.query.pinCode);
      filter.$or = [
        { pinCode },
        {
          deliveryEnabled: true,
          "deliverySettings.serviceablePinCodes": pinCode,
        },
      ];
    }
    if (req.query.city)
      filter.city = new RegExp(
        `^${escaped(String(req.query.city).slice(0, 100))}$`,
        "i",
      );
    if (req.query.neighborhood)
      filter.neighborhood = new RegExp(
        escaped(String(req.query.neighborhood).slice(0, 100)),
        "i",
      );
    if (req.query.search)
      filter.name = new RegExp(
        escaped(String(req.query.search).slice(0, 100)),
        "i",
      );
    if (req.query.category)
      filter.category = new RegExp(
        escaped(String(req.query.category).slice(0, 100)),
        "i",
      );
    res.json(
      await paged(Shop, filter, req.query, { select: "-businessDetails" }),
    );
  });
  router.get("/shops/by-id/:id", async (req, res) => {
    const shop = await publicShop(req.params.id);
    const value = shop.toObject();
    delete value.businessDetails;
    res.json({ shop: value });
  });
  router.get("/shops/:slug", async (req, res) => {
    const shop = await Shop.findOne({
      slug: String(req.params.slug),
      ...liveShopFilter,
    }).select("-businessDetails");
    if (!shop) fail(404, "Store not found.");
    res.json({ shop });
  });
  router.patch("/shops/:id", auth, async (req, res) => {
    const values = shopSettingsSchema.parse(req.body);
    let shop;
    await mongoose.connection.transaction(async (session) => {
      shop = await ownShop(req.user, req.params.id, { session });
      if (values.businessType && values.businessType !== shop.businessType) {
        const futureClass = await ClassSession.exists({
          shopId: shop._id,
          cancelled: false,
          endsAt: mongoose.trusted({ $gt: new Date() }),
        }).session(session);
        const activeTicket = await BarberTicket.exists({
          shopId: shop._id,
          $or: [
            { status: "ONGOING" },
            {
              status: "WAITING",
              expiresAt: mongoose.trusted({ $gt: new Date() }),
            },
          ],
        }).session(session);
        const activeOrder = await Order.exists({
          shopId: shop._id,
          orderStatus: mongoose.trusted({
            $nin: ["COMPLETED", "CANCELLED", "REJECTED"],
          }),
        }).session(session);
        if (futureClass || activeTicket || activeOrder)
          fail(
            409,
            "Finish or cancel existing orders, sessions and appointments before changing business type.",
          );
      }
      Object.assign(shop, values);
      await shop.save({ session });
      if (req.user.role === "admin")
        await audit(
          req.user,
          "SHOP_EDIT",
          shop,
          { fields: Object.keys(values) },
          session,
        );
    });
    res.json({ shop });
  });
  router.get("/shops/:shopId/categories", async (req, res) => {
    await publicShop(req.params.shopId);
    res.json(
      await paged(
        Category,
        { shopId: req.params.shopId, active: true },
        req.query,
        { sort: { displayOrder: 1, name: 1 } },
      ),
    );
  });
  router.get("/manage/shops/:shopId/categories", auth, async (req, res) => {
    await ownShop(req.user, req.params.shopId);
    res.json(
      await paged(Category, { shopId: req.params.shopId }, req.query, {
        sort: { displayOrder: 1 },
      }),
    );
  });
  router.post("/shops/:shopId/categories", auth, async (req, res) => {
    const values = categorySchema.parse(req.body);
    let category;
    await mongoose.connection.transaction(async (session) => {
      await ownShop(req.user, req.params.shopId, { session });
      [category] = await Category.create(
        [{ ...values, slug: slugify(values.name), shopId: req.params.shopId }],
        { session },
      );
    });
    res.status(201).json({ category });
  });
  for (const method of ["patch", "delete"])
    router[method]("/categories/:id", auth, async (req, res) => {
      let category;
      await mongoose.connection.transaction(async (session) => {
        category = await Category.findById(objectId(req.params.id)).session(
          session,
        );
        if (!category) fail(404, "Category not found.");
        const shop = await ownShop(req.user, category.shopId, { session });
        // Touch the same parent as product writes to serialize deletion against creation.
        shop.revision += 1;
        await shop.save({ session });
        if (method === "delete") {
          if (
            await Product.exists({
              categoryId: category.id,
              active: true,
            }).session(session)
          )
            fail(
              409,
              "Archive or move active products before deleting this category.",
            );
          category.active = false;
        } else {
          const values = categorySchema.parse(req.body);
          if (
            !values.active &&
            (await Product.exists({
              categoryId: category.id,
              active: true,
            }).session(session))
          )
            fail(
              409,
              "Archive or move active products before hiding this category.",
            );
          Object.assign(category, values, { slug: slugify(values.name) });
        }
        await category.save({ session });
      });
      res.json({ category });
    });
  router.get("/shops/:shopId/products", async (req, res) => {
    await publicShop(req.params.shopId);
    const filter = productFilter(req, {
      shopId: req.params.shopId,
      active: true,
    });
    res.json(
      await paged(Product, filter, req.query, {
        populate: { path: "catalogId", select: "image name barcode" },
      }),
    );
  });
  router.get("/manage/shops/:shopId/products", auth, async (req, res) => {
    await ownShop(req.user, req.params.shopId);
    res.json(
      await paged(
        Product,
        productFilter(req, { shopId: req.params.shopId }),
        req.query,
        { populate: { path: "catalogId", select: "image name barcode" } },
      ),
    );
  });
  router.post("/shops/:shopId/products", auth, async (req, res) => {
    const values = productSchema.parse(req.body);
    let product;
    await mongoose.connection.transaction(async (session) => {
      const shop = await ownShop(req.user, req.params.shopId, { session });
      await validateCategory(values, shop.id, session);
      shop.revision += 1;
      await shop.save({ session });
      [product] = await Product.create([{ ...values, shopId: shop.id }], {
        session,
      });
      if (req.user.role === "admin")
        await audit(req.user, "PRODUCT_CREATE", product, {}, session);
    });
    res.status(201).json({ product });
  });
  router.patch("/products/:id", auth, async (req, res) => {
    const values = productSchema.parse(req.body);
    let product;
    await mongoose.connection.transaction(async (session) => {
      product = await Product.findById(objectId(req.params.id)).session(
        session,
      );
      if (!product) fail(404, "Product not found.");
      const shop = await ownShop(req.user, product.shopId, { session });
      await validateCategory(values, shop.id, session);
      shop.revision += 1;
      await shop.save({ session });
      Object.assign(product, values);
      await product.save({ session });
      if (req.user.role === "admin")
        await audit(
          req.user,
          "PRODUCT_EDIT",
          product,
          { fields: Object.keys(values) },
          session,
        );
    });
    res.json({ product });
  });
  router.delete("/products/:id", auth, async (req, res) => {
    let product;
    await mongoose.connection.transaction(async (session) => {
      product = await Product.findById(objectId(req.params.id)).session(
        session,
      );
      if (!product) fail(404, "Product not found.");
      await ownShop(req.user, product.shopId, { session });
      product.active = false;
      await product.save({ session });
      if (req.user.role === "admin")
        await audit(req.user, "PRODUCT_ARCHIVE", product, {}, session);
    });
    res.json({ product });
  });
  router.patch("/shops/:shopId/availability", auth, async (req, res) => {
    const values = z
      .object({
        ids: z.array(id).min(1).max(100),
        availabilityStatus: z.enum([
          "AVAILABLE",
          "CONFIRM_AVAILABILITY",
          "OUT_OF_STOCK",
        ]),
      })
      .strict()
      .parse(req.body);
    await mongoose.connection.transaction(async (session) => {
      const shop = await ownShop(req.user, req.params.shopId, { session });
      const products = await Product.find({
        _id: mongoose.trusted({ $in: values.ids }),
        shopId: req.params.shopId,
      }).session(session);
      if (products.length !== new Set(values.ids).size)
        fail(403, "Some products do not belong to this store.");
      await Product.updateMany(
        {
          _id: mongoose.trusted({ $in: values.ids }),
          shopId: req.params.shopId,
        },
        { $set: { availabilityStatus: values.availabilityStatus } },
        { session },
      );
      if (req.user.role === "admin")
        await audit(
          req.user,
          "PRODUCT_BULK_AVAILABILITY",
          shop,
          values,
          session,
        );
    });
    res.json({ updated: values.ids.length });
  });
  router.get("/products/search", async (req, res) => {
    const pinCode = req.query.pinCode
      ? z
          .string()
          .regex(/^[1-9]\d{5}$/)
          .parse(req.query.pinCode)
      : undefined;
    const stores = await Shop.find({
      ...liveShopFilter,
      ...(pinCode
        ? {
            $or: [
              { pinCode },
              {
                deliveryEnabled: true,
                "deliverySettings.serviceablePinCodes": pinCode,
              },
            ],
          }
        : {}),
      ...(req.query.city
        ? {
            city: new RegExp(
              `^${escaped(String(req.query.city).slice(0, 100))}$`,
              "i",
            ),
          }
        : {}),
    })
      .select("_id")
      .limit(500);
    res.json(
      await paged(
        Product,
        productFilter(req, {
          shopId: mongoose.trusted({ $in: stores.map((s) => s._id) }),
          active: true,
        }),
        req.query,
        {
          populate: [
            { path: "shopId", select: "name slug" },
            { path: "catalogId", select: "image" },
          ],
        },
      ),
    );
  });
  router.get(
    "/catalog",
    auth,
    requireRole("shopkeeper", "admin"),
    async (req, res) => {
      const filter = req.query.barcode
        ? { barcode: String(req.query.barcode).slice(0, 50) }
        : req.query.search
          ? {
              name: new RegExp(
                escaped(String(req.query.search).slice(0, 100)),
                "i",
              ),
            }
          : {};
      res.json(await paged(CatalogProduct, filter, req.query));
    },
  );
  router.get("/products/:id", async (req, res) => {
    const product = await Product.findOne({
      _id: objectId(req.params.id),
      active: true,
    }).populate("catalogId", "image name barcode");
    if (!product) fail(404, "Product not found.");
    await publicShop(product.shopId);
    res.json({ product });
  });
  return router;
}
function productFilter(req, filter) {
  if (req.query.ids) {
    const ids = z
      .array(id)
      .min(1)
      .max(100)
      .parse(String(req.query.ids).split(","));
    filter._id = mongoose.trusted({ $in: ids });
  }
  if (req.query.search)
    filter.name = new RegExp(
      escaped(String(req.query.search).slice(0, 100)),
      "i",
    );
  if (req.query.categoryId) filter.categoryId = objectId(req.query.categoryId);
  return filter;
}
async function validateCategory(values, shopId, session) {
  if (
    !(await Category.exists({
      _id: values.categoryId,
      shopId,
      active: true,
    }).session(session))
  )
    fail(400, "Choose an active category from this store.");
  if (
    values.catalogId &&
    !(await CatalogProduct.exists({ _id: values.catalogId }).session(session))
  )
    fail(400, "Catalog item not found.");
}
