import fs from "node:fs/promises";
import crypto from "node:crypto";
const path = new URL("../.env", import.meta.url);
try {
  const template = await fs.readFile(
    new URL("../.env.example", import.meta.url),
    "utf8",
  );
  await fs.writeFile(
    path,
    template
      .replace(
        "replace-with-at-least-32-random-characters",
        crypto.randomBytes(48).toString("hex"),
      )
      .replace(
        "PICKUP_ENCRYPTION_SECRET=",
        `PICKUP_ENCRYPTION_SECRET=${crypto.randomBytes(48).toString("hex")}`,
      ),
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "Created ignored .env with random secrets and a local replica-set URI. Add Cloudinary credentials to enable uploads.",
  );
} catch (error) {
  if (error.code === "EEXIST") console.log("Existing .env preserved.");
  else throw error;
}
