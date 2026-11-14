import crypto from "node:crypto";
import mongoose from "mongoose";
import sharp from "sharp";
import {
  Product,
  Shop,
  CatalogProduct,
  MediaAsset,
} from "../models/marketplace.js";
import { ownShop } from "../middleware/ownership.js";
import { fail, objectId } from "../utils/http.js";
import { audit } from "./audit.js";
sharp.cache({ memory: 16, files: 0, items: 32 });
sharp.concurrency(1);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export async function optimizeImage(buffer) {
  if (!buffer?.length || buffer.length > MAX_IMAGE_BYTES)
    fail(400, "Use an image smaller than 5 MB.");
  try {
    const input = sharp(buffer, {
      limitInputPixels: 20000000,
      animated: false,
      failOn: "error",
    });
    const info = await input.metadata();
    if (
      !(
        ["jpeg", "png", "webp", "avif"].includes(info.format) ||
        (info.format === "heif" && info.compression === "av1")
      ) ||
      (info.pages || 1) > 1
    )
      fail(400, "Use a static JPEG, PNG, WebP or AVIF image.");
    return await input
      .rotate()
      .resize({
        width: 1200,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 78, effort: 4 })
      .toBuffer();
  } catch (error) {
    if (error.status) throw error;
    fail(
      400,
      "This file is not a supported, valid image (maximum 20 megapixels).",
    );
  }
}
const models = { product: Product, shop: Shop, catalog: CatalogProduct };
export async function imageTarget(user, type, id, session) {
  const Model = models[type];
  if (!Model) fail(400, "Invalid image target.");
  const target = await Model.findById(objectId(id)).session(session || null);
  if (!target) fail(404, "Image target not found.");
  if (type === "catalog") {
    if (user.role !== "admin")
      fail(403, "Only admins manage shared catalog images.");
  } else
    await ownShop(user, type === "shop" ? id : target.shopId, {
      session,
      approved: type !== "shop",
    });
  return target;
}
export async function replaceImage(user, type, id, buffer, storage) {
  await imageTarget(user, type, id); // Check authorization before CPU work or provider calls.
  if (storage.configured === false)
    fail(
      503,
      "Image storage is not configured. Set the Cloudinary environment variables.",
    );
  const optimized = await optimizeImage(buffer);
  const publicId = `localcart/${type}/${id}/${crypto.randomUUID()}`;
  const asset = await MediaAsset.create({
    ownerId: user.id,
    targetType: type,
    targetId: id,
    provider: storage.provider,
    publicId,
    state: "uploading",
  });
  let metadata;
  try {
    metadata = await storage.upload(optimized, publicId);
    await mongoose.connection.transaction(async (session) => {
      const target = await imageTarget(user, type, id, session);
      const previousId = target.image?.publicId;
      const attached = await MediaAsset.updateOne(
        { _id: asset.id, state: "uploading" },
        { $set: { ...metadata, state: "attached" } },
        { session },
      );
      if (attached.modifiedCount !== 1)
        fail(409, "The upload expired before attachment. Try again.");
      target.image = metadata;
      await target.save({ session });
      if (previousId)
        await MediaAsset.updateMany(
          { publicId: previousId, state: "attached" },
          { $set: { state: "retired" } },
          { session },
        );
      if (user.role === "admin")
        await audit(
          user,
          "IMAGE_REPLACE",
          target,
          { publicId: metadata.publicId },
          session,
        );
    });
    return metadata;
  } catch (error) {
    await MediaAsset.updateOne(
      { _id: asset.id },
      { $set: { state: "retired" } },
    );
    throw error;
  }
}
export async function detachImage(user, type, id) {
  await mongoose.connection.transaction(async (session) => {
    const target = await imageTarget(user, type, id, session);
    const previousId = target.image?.publicId;
    target.image = undefined;
    await target.save({ session });
    if (previousId)
      await MediaAsset.updateMany(
        { publicId: previousId },
        { $set: { state: "retired" } },
        { session },
      );
    if (user.role === "admin")
      await audit(user, "IMAGE_REMOVE", target, {}, session);
  });
}
export async function cleanupImages(storage) {
  // A failed process may leave an uploading record; retain it for 24h before reclaiming.
  const assets = await MediaAsset.find({
    $or: [
      { state: "retired" },
      {
        state: "uploading",
        updatedAt: mongoose.trusted({ $lt: new Date(Date.now() - 86400000) }),
      },
    ],
  })
    .sort({ updatedAt: 1 })
    .limit(20);
  for (const asset of assets) {
    if (asset.provider !== storage.provider) continue;
    if (asset.state === "uploading") {
      const claim = await MediaAsset.updateOne(
        {
          _id: asset.id,
          state: "uploading",
          updatedAt: mongoose.trusted({ $lt: new Date(Date.now() - 86400000) }),
        },
        { $set: { state: "retired" } },
      );
      if (claim.modifiedCount !== 1) continue;
      asset.state = "retired";
    }
    // Never delete an asset still referenced, including shared catalog images.
    const referenced = await Promise.all(
      Object.values(models).map((Model) =>
        Model.exists({ "image.publicId": asset.publicId }),
      ),
    );
    if (referenced.some(Boolean)) {
      asset.state = "attached";
      await asset.save();
      continue;
    }
    try {
      await storage.remove(asset.publicId);
      await asset.deleteOne();
    } catch (error) {
      asset.attempts += 1;
      asset.lastError = "Provider deletion failed; will retry.";
      await asset.save();
    }
  }
}
