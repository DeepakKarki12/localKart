import mongoose from "mongoose";
import { readEnv } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { createStorage } from "../services/storage/index.js";
import { cleanupImages } from "../services/images.js";
try {
  const env = readEnv();
  await connectDatabase(env.MONGODB_URI);
  await cleanupImages(createStorage(env));
  console.log("Image cleanup batch finished.");
} catch (error) {
  console.error("Image cleanup failed:", error.name);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
