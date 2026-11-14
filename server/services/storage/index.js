import { cloudinaryStorage } from "./cloudinary.js";
// Provider contract: upload(WebP Buffer, unique key) -> image URL metadata;
// remove(publicId) must be idempotent. No product routes use provider SDKs.
export function createStorage(env) {
  return cloudinaryStorage(env);
}
