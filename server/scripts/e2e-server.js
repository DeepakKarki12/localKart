// Isolated test harness. Never connects to an existing application database.
import "../tests/helpers/mongo.js";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createServer as createVite } from "vite";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { createApp } from "../app.js";
import { attachSockets } from "../sockets/index.js";
import { User } from "../models/User.js";
const mongo = await MongoMemoryReplSet.create({
  replSet: {
    count: 1,
    storageEngine: "wiredTiger",
    configSettings: { electionTimeoutMillis: 10000 },
  },
});
await connectDatabase(mongo.getUri());
for (const model of Object.values(mongoose.models)) await model.init();
await User.create({
  name: "Test Administrator",
  email: "admin@localcart.test",
  phone: "9876543210",
  passwordHash: await bcrypt.hash("test-admin-password-123", 12),
  role: "admin",
});
const env = {
  JWT_SECRET: "e2e-only-secret-longer-than-thirty-two-characters",
  CLIENT_URL: "http://127.0.0.1:5179",
  NODE_ENV: "test",
};
const app = createApp(env);
const server = createServer(app);
const io = attachSockets(server, app, env);
await new Promise((resolve) => server.listen(5109, "127.0.0.1", resolve));
process.env.API_PROXY_TARGET = "http://127.0.0.1:5109";
const vite = await createVite({
  root: fileURLToPath(new URL("../../client", import.meta.url)),
  server: { host: "127.0.0.1", port: 5179, strictPort: true },
});
await vite.listen();
console.log("Isolated browser test application ready on http://127.0.0.1:5179");
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await vite.close();
  io.close();
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(0);
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
