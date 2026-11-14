import mongoose from "mongoose";
export async function connectDatabase(uri) {
  mongoose.set("sanitizeFilter", true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
    minPoolSize: 0,
  });
}
export async function requireTransactions() {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== "isdbgrid") {
    const error = new Error("MongoDB replica set required");
    error.publicMessage =
      "Use MongoDB Atlas or a local replica set. Standalone MongoDB does not support the order transactions.";
    throw error;
  }
}
