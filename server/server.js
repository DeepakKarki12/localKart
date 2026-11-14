import mongoose from "mongoose";
import { readEnv } from "./config/env.js";
import { connectDatabase, requireTransactions } from "./config/database.js";
import { createApp } from "./app.js";
import { createServer } from "node:http";
import { attachSockets } from "./sockets/index.js";
import { createStorage } from "./services/storage/index.js";
import { cleanupImages } from "./services/images.js";
try {
  const env = readEnv();
  await connectDatabase(env.MONGODB_URI);
  await requireTransactions();
  for (const model of Object.values(mongoose.models)) await model.init();
  const storage = createStorage(env);
  const app = createApp(env, { storage });
  const server = createServer(app);
  const io = attachSockets(server, app, env);
  server.listen(env.PORT, () =>
    console.log(`LocalCart API listening on http://localhost:${env.PORT}`),
  );
  let cleaning = false;
  const cleanupTimer = setInterval(async () => {
    if (cleaning) return;
    cleaning = true;
    try {
      await cleanupImages(storage);
    } catch (error) {
      console.error("Image cleanup deferred:", error.name);
    } finally {
      cleaning = false;
    }
  }, 15 * 60000).unref();
  const shutdown = () => {
    clearInterval(cleanupTimer);
    io.close();
    const timeout = setTimeout(() => process.exit(1), 10000).unref();
    server.close(async () => {
      await mongoose.disconnect();
      clearTimeout(timeout);
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} catch (error) {
  console.error(
    "Startup failed. Check MongoDB connectivity and required environment variables.",
    error.publicMessage || error.name,
  );
  process.exit(1);
}
