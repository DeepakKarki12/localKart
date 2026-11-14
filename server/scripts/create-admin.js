import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { readEnv } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { registerSchema } from "../validators/auth.js";
import { User } from "../models/User.js";
try {
  const env = readEnv();
  const data = registerSchema.parse({
    name: process.env.ADMIN_NAME,
    email: process.env.ADMIN_EMAIL,
    phone: process.env.ADMIN_PHONE,
    password: process.env.ADMIN_PASSWORD,
  });
  await connectDatabase(env.MONGODB_URI);
  if (await User.exists({ email: data.email }))
    throw new Error("Account already exists; refusing to change its role.");
  await User.create({
    name: data.name,
    email: data.email,
    phone: data.phone,
    passwordHash: await bcrypt.hash(data.password, 12),
    role: "admin",
  });
  console.log(
    "Administrator created. Remove ADMIN_PASSWORD from your environment.",
  );
} catch (error) {
  console.error(
    error.name === "ZodError"
      ? "Provide valid ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE and a 12–72 byte ADMIN_PASSWORD."
      : "Admin setup failed: " + error.message,
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
