import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import { findMongod } from "./mongod-path.mjs";
dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
const dataDirectory = path.resolve(
  fileURLToPath(new URL("../.local-data/mongo", import.meta.url)),
);
await fs.mkdir(dataDirectory, { recursive: true });
const mongod = spawn(
  findMongod(),
  [
    "--dbpath",
    dataDirectory,
    "--port",
    "27018",
    "--bind_ip",
    "127.0.0.1",
    "--replSet",
    "localcart-rs",
    "--logpath",
    path.join(dataDirectory, "mongod.log"),
    "--logappend",
  ],
  { stdio: "ignore", windowsHide: true },
);
mongod.on("error", (error) => {
  console.error(
    "Cannot start mongod. Install MongoDB Community Server or set MONGOD_PATH in .env.",
  );
  process.exitCode = 1;
});
let exited = false;
mongod.on("exit", (code) => {
  exited = true;
  if (code) {
    console.error(
      "MongoDB stopped. Check .local-data/mongo/mongod.log for a port or data-directory conflict.",
    );
    process.exitCode = 1;
  }
});
const client = new MongoClient(
  "mongodb://127.0.0.1:27018/?directConnection=true",
  { serverSelectionTimeoutMS: 1000 },
);
let connected = false;
for (let i = 0; i < 30 && !exited; i++) {
  try {
    await client.connect();
    connected = true;
    break;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
if (!connected) {
  mongod.kill();
  throw new Error("Local MongoDB did not start.");
}
try {
  const status = await client.db("admin").command({ serverStatus: 1 });
  if (Number(status.pid) !== mongod.pid)
    throw new Error(
      "Port 27018 belongs to another process. Refusing to modify it.",
    );
  const hello = await client.db("admin").command({ hello: 1 });
  if (hello.setName && hello.setName !== "localcart-rs")
    throw new Error(
      "Unexpected replica set on port 27018. Refusing to modify it.",
    );
  if (!hello.setName)
    await client.db("admin").command({
      replSetInitiate: {
        _id: "localcart-rs",
        members: [{ _id: 0, host: "127.0.0.1:27018" }],
      },
    });
  console.log(
    "Persistent local MongoDB replica set ready on port 27018. Keep this terminal open. Data: .local-data/mongo",
  );
} catch (error) {
  mongod.kill();
  throw error;
} finally {
  await client.close();
}
let closing = false;
const stop = () => {
  if (closing) return;
  closing = true;
  mongod.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
