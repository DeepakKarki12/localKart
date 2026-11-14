import crypto from "node:crypto";
import sharp from "sharp";
import { readEnv } from "../config/env.js";
import { createStorage } from "../services/storage/index.js";
import { optimizeImage } from "../services/images.js";
const storage = createStorage(readEnv());
const key = `localcart/verification/${crypto.randomUUID()}`;
try {
  const input = await sharp({
    create: { width: 80, height: 80, channels: 3, background: "#16734b" },
  })
    .png()
    .toBuffer();
  const image = await storage.upload(await optimizeImage(input), key);
  const response = await fetch(image.thumbnailUrl);
  if (
    !response.ok ||
    !response.headers.get("content-type")?.startsWith("image/")
  )
    throw new Error("CDN delivery failed.");
  console.log("Live Cloudinary upload and CDN delivery verified.");
} catch (error) {
  console.error(
    "Live Cloudinary verification failed. Check credentials and provider configuration.",
  );
  process.exitCode = 1;
} finally {
  if (storage.configured) {
    try {
      await storage.remove(key);
      console.log("Verification image removed.");
    } catch {
      console.error(
        "Verification asset could not be removed; check the localcart/verification folder in Cloudinary.",
      );
      process.exitCode = 1;
    }
  }
}
