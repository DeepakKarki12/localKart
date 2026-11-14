import crypto from "node:crypto";
export const hashCode = (code, secret) =>
  crypto
    .createHmac("sha256", secret)
    .update(`localcart-pickup-code:${code}`)
    .digest("hex");
const key = (secret) =>
  crypto.createHash("sha256").update(`localcart-pickup:${secret}`).digest();
export function encryptCode(code, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(secret), iv);
  const data = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString("hex"))
    .join(".");
}
export function decryptCode(value, secret) {
  const [iv, tag, data] = value.split(".").map((v) => Buffer.from(v, "hex"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
