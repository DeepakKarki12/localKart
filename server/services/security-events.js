import crypto from "node:crypto";
import { SecurityEvent } from "../models/marketplace.js";
export async function recordLoginFailure(req, email, secret, userId) {
  const digest = (value) =>
    crypto
      .createHmac("sha256", secret)
      .update(value)
      .digest("hex")
      .slice(0, 24);
  await SecurityEvent.create({
    type: "LOGIN_FAILED",
    emailFingerprint: digest(email),
    ipFingerprint: digest(req.ip || "unknown"),
    userId,
  });
}
