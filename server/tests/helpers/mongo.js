import fs from "node:fs";
import { findMongod } from "../../../scripts/mongod-path.mjs";
// Prefer an installed binary without downloading a second MongoDB distribution.
if (!process.env.MONGOMS_SYSTEM_BINARY) {
  const candidate = findMongod();
  if (fs.existsSync(candidate)) {
    process.env.MONGOMS_SYSTEM_BINARY = candidate;
    process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = "false";
  }
}
