import { before, after, test } from "node:test";
import "./helpers/mongo.js";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../app.js";
import { connectDatabase, requireTransactions } from "../config/database.js";
import { User } from "../models/User.js";
import { Session } from "../models/Session.js";
let mongo, app, token, cookie, customerId;
const customer = {
  name: "Asha Sharma",
  email: "asha@example.com",
  phone: "9876543210",
  password: "neighborhood-strong-password",
};
before(
  async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri());
    await Promise.all([User.init(), Session.init()]);
    app = createApp({
      JWT_SECRET: "test-secret-that-is-longer-than-thirty-two-characters",
      CLIENT_URL: "http://localhost:5173",
      NODE_ENV: "test",
    });
  },
  { timeout: 180000 },
);
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
test("health reflects actual database connection", async () => {
  await request(app).get("/api/health").expect(200);
});
test("registration persists a bcrypt hash and returns a safe customer", async () => {
  const response = await request(app)
    .post("/api/auth/register")
    .send(customer)
    .expect(201);
  token = response.body.accessToken;
  cookie = response.headers["set-cookie"][0].split(";")[0];
  customerId = response.body.user.id;
  assert.equal(response.body.user.role, "customer");
  assert.equal(response.body.user.passwordHash, undefined);
  assert.match(response.headers["set-cookie"][0], /HttpOnly/);
  const saved = await User.findById(customerId).select("+passwordHash");
  assert.notEqual(saved.passwordHash, customer.password);
  assert.match(saved.passwordHash, /^\$2b\$/);
  assert.equal(
    (await Session.findOne({ userId: customerId })).tokenHash.length,
    64,
  );
});
test("duplicate account conflicts and public admin escalation is rejected", async () => {
  await request(app).post("/api/auth/register").send(customer).expect(409);
  await request(app)
    .post("/api/auth/register")
    .send({ ...customer, email: "other@example.com", role: "admin" })
    .expect(400);
});
test("invalid fields, NoSQL operator payloads, and long UTF-8 passwords are rejected", async () => {
  await request(app)
    .post("/api/auth/register")
    .send({ ...customer, phone: "123", password: "short" })
    .expect(400);
  await request(app)
    .post("/api/auth/login")
    .send({ email: { $ne: null }, password: "anything" })
    .expect(400);
  await request(app)
    .post("/api/auth/register")
    .send({ ...customer, password: "😀".repeat(25) })
    .expect(400);
});
test("login accepts correct credentials and rejects incorrect credentials", async () => {
  await request(app)
    .post("/api/auth/login")
    .send({ email: customer.email, password: "incorrect" })
    .expect(401);
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email: customer.email, password: customer.password })
    .expect(200);
  assert.equal(response.body.user.id, customerId);
});
test("me requires valid authentication and does not expose secrets", async () => {
  await request(app).get("/api/auth/me").expect(401);
  await request(app)
    .get("/api/auth/me")
    .set("Authorization", "Bearer forged")
    .expect(401);
  const response = await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  assert.equal(response.body.user.email, customer.email);
  assert.equal(response.body.user.passwordHash, undefined);
});
test("backend role enforcement denies customers and permits database-assigned admins", async () => {
  await request(app)
    .get("/api/admin/access")
    .set("Authorization", `Bearer ${token}`)
    .expect(403);
  await request(app)
    .get("/api/shopkeeper/access")
    .set("Authorization", `Bearer ${token}`)
    .expect(403);
  await User.findByIdAndUpdate(customerId, { role: "admin" });
  await request(app)
    .get("/api/admin/access")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  await User.findByIdAndUpdate(customerId, { role: "customer" });
});
test("refresh rotates tokens, rejects replay, and logout revokes the session", async () => {
  const response = await request(app)
    .post("/api/auth/refresh")
    .set("Cookie", cookie)
    .expect(200);
  await request(app)
    .post("/api/auth/refresh")
    .set("Cookie", cookie)
    .expect(401);
  const nextCookie = response.headers["set-cookie"][0].split(";")[0];
  await request(app)
    .post("/api/auth/logout")
    .set("Cookie", nextCookie)
    .expect(204);
  await request(app)
    .post("/api/auth/refresh")
    .set("Cookie", nextCookie)
    .expect(401);
});
test("concurrent refresh attempts consume the token exactly once", async () => {
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: customer.email, password: customer.password })
    .expect(200);
  const sharedCookie = login.headers["set-cookie"][0].split(";")[0];
  const responses = await Promise.all(
    [1, 2].map(() =>
      request(app).post("/api/auth/refresh").set("Cookie", sharedCookie),
    ),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 401]);
});
test("suspension immediately blocks existing access tokens and new login", async () => {
  await User.findByIdAndUpdate(customerId, { accountStatus: "suspended" });
  await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${token}`)
    .expect(401);
  await request(app)
    .post("/api/auth/login")
    .send({ email: customer.email, password: customer.password })
    .expect(401);
});
test("untrusted origins, cross-site requests, invalid JSON and unknown routes fail safely", async () => {
  await request(app)
    .post("/api/auth/refresh")
    .set("Origin", "https://untrusted.example")
    .expect(403);
  await request(app)
    .post("/api/auth/refresh")
    .set("Sec-Fetch-Site", "cross-site")
    .expect(403);
  await request(app)
    .post("/api/auth/login")
    .set("Content-Type", "application/json")
    .send("{")
    .expect(400);
  await request(app).get("/api/missing").expect(404);
});
test("password-attempt throttling does not consume the valid refresh-session budget", async () => {
  await User.findByIdAndUpdate(customerId, { accountStatus: "active" });
  const isolated = createApp({
    JWT_SECRET: "test-secret-that-is-longer-than-thirty-two-characters",
    CLIENT_URL: "http://localhost:5173",
    NODE_ENV: "test",
  });
  const loggedIn = await request(isolated)
    .post("/api/auth/login")
    .send({ email: customer.email, password: customer.password })
    .expect(200);
  for (let i = 0; i < 39; i++)
    await request(isolated)
      .post("/api/auth/login")
      .send({ email: "invalid", password: "wrong" })
      .expect(400);
  const throttled = await request(isolated)
    .post("/api/auth/login")
    .send({ email: "invalid", password: "wrong" })
    .expect(429);
  assert.match(throttled.body.message, /attempts/);
  await request(isolated)
    .post("/api/auth/refresh")
    .set("Cookie", loggedIn.headers["set-cookie"][0].split(";")[0])
    .expect(200);
});
test("standalone MongoDB is rejected by the marketplace startup transaction check", async () => {
  await assert.rejects(
    () => requireTransactions(),
    (error) => /replica set/.test(error.message),
  );
});
