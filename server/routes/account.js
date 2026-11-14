import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { authenticate, requireRole } from "../middleware/auth.js";
import { User, publicUser } from "../models/User.js";
import {
  Notification,
  ProductRequest,
  Product,
} from "../models/marketplace.js";
import { profileSchema, id } from "../validators/marketplace.js";
import { fail, paged, objectId } from "../utils/http.js";
import { ownShop, publicShop } from "../middleware/ownership.js";
export function accountRoutes(env) {
  const router = Router();
  router.use(
    ["/profile", "/notifications", "/requests", "/shops/:shopId/requests"],
    authenticate(env.JWT_SECRET),
  );
  router.patch("/profile", async (req, res) => {
    const values = profileSchema.parse(req.body);
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: values },
      { new: true, runValidators: true },
    );
    res.json({ user: publicUser(user) });
  });
  router.get("/notifications", async (req, res) => {
    const filter = { recipientId: req.user.id };
    if (req.query.read !== undefined)
      filter.read = z.enum(["true", "false"]).parse(req.query.read) === "true";
    res.json(await paged(Notification, filter, req.query));
  });
  router.patch("/notifications/:id/read", async (req, res) => {
    const notification = await Notification.findOneAndUpdate(
      { _id: objectId(req.params.id), recipientId: req.user.id },
      { $set: { read: true } },
      { new: true },
    );
    if (!notification) fail(404, "Notification not found.");
    res.json({ notification });
  });
  router.post("/requests", requireRole("customer"), async (req, res) => {
    const values = z
      .object({ shopId: id, message: z.string().trim().min(3).max(500) })
      .strict()
      .parse(req.body);
    await publicShop(values.shopId);
    res.status(201).json({
      request: await ProductRequest.create({
        ...values,
        customerId: req.user.id,
      }),
    });
  });
  router.get(
    "/shops/:shopId/requests",
    requireRole("shopkeeper", "admin"),
    async (req, res) => {
      await ownShop(req.user, req.params.shopId);
      const filter = { shopId: req.params.shopId };
      if (req.query.resolved !== undefined) {
        filter.resolved =
          z.enum(["true", "false"]).parse(req.query.resolved) === "true";
      }
      res.json(await paged(ProductRequest, filter, req.query));
    },
  );
  router.patch(
    "/requests/:id",
    requireRole("shopkeeper", "admin"),
    async (req, res) => {
      const values = z
        .object({ resolved: z.boolean(), productId: id.optional() })
        .strict()
        .refine(
          (value) => !value.productId || value.resolved,
          "Available items must resolve the request.",
        )
        .parse(req.body);
      let item;
      await mongoose.connection.transaction(async (session) => {
        item = await ProductRequest.findById(objectId(req.params.id)).session(
          session,
        );
        if (!item) fail(404, "Request not found.");
        const shop = await ownShop(req.user, item.shopId, { session });
        if (values.productId) {
          if (item.resolved)
            fail(409, "This request is already closed. Reopen it first.");
          const product = await Product.findOne({
            _id: values.productId,
            shopId: item.shopId,
            active: true,
          }).session(session);
          if (
            !product ||
            product.availabilityStatus !== "AVAILABLE" ||
            (product.inventoryTrackingEnabled && product.stockQuantity <= 0)
          ) {
            fail(400, "Choose an available, in-stock product from this store.");
          }
          await publicShop(shop._id);
          await Notification.create(
            [
              {
                recipientId: item.customerId,
                productId: product._id,
                shopSlug: shop.slug,
                productName: product.name,
                shopName: shop.name,
                type: "PRODUCT_AVAILABLE",
                message: `Your requested item, ${product.name}, is now available at ${shop.name}.`,
              },
            ],
            { session },
          );
          item.availableProductId = product._id;
        } else {
          item.availableProductId = undefined;
        }
        item.resolved = values.resolved;
        await item.save({ session });
      });
      res.json({ request: item });
    },
  );
  return router;
}
