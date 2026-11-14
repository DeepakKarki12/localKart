import { before, after, test } from "node:test";
import "./helpers/mongo.js";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import sharp from "sharp";
import fs from "node:fs";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../app.js";
import { connectDatabase } from "../config/database.js";
import { User } from "../models/User.js";
import {
  Shop,
  Category,
  Product,
  Order,
  CatalogProduct,
  MediaAsset,
  Notification,
  AuditLog,
} from "../models/marketplace.js";
import {
  cleanupImages,
  optimizeImage,
  replaceImage,
} from "../services/images.js";
let mongo,
  app,
  admin,
  owner,
  other,
  buyer,
  shop,
  otherShop,
  category,
  product,
  pickup;
const password = "secure-password-for-testing";
const env = {
  JWT_SECRET: "test-marketplace-secret-longer-than-thirty-two-characters",
  CLIENT_URL: "http://localhost:5173",
  NODE_ENV: "test",
};
const removed = [];
let uploadFails = false;
let uploaded = 0;
let removalFails = false;
// External provider boundary only is stubbed: authorization, image decoding,
// MongoDB transactions, attachment and cleanup are real. Live Cloudinary needs credentials.
const storage = {
  provider: "cloudinary",
  upload: async (buffer, publicId) => {
    if (uploadFails) throw new Error("Test provider outage");
    uploaded++;
    assert.equal((await sharp(buffer).metadata()).format, "webp");
    return {
      provider: "cloudinary",
      publicId,
      url: `https://res.cloudinary.com/test/${publicId}`,
      thumbnailUrl: `https://res.cloudinary.com/test/w_320/${publicId}`,
      detailUrl: `https://res.cloudinary.com/test/w_960/${publicId}`,
    };
  },
  remove: async (key) => {
    if (removalFails) throw new Error("offline");
    removed.push(key);
  },
};
const auth = (token) => ({ Authorization: `Bearer ${token}` });
async function register(email) {
  const response = await request(app)
    .post("/api/auth/register")
    .send({ name: "Local Neighbor", email, phone: "9876543210", password })
    .expect(201);
  return { token: response.body.accessToken, id: response.body.user.id };
}
const application = (name) => ({
  name,
  category: "Groceries",
  description: "Neighborhood groceries",
  address: "12 Main Road",
  city: "Pune",
  neighborhood: "Baner",
  pinCode: "411045",
  phone: "9876543210",
});
const listing = () => ({
  name: "Fresh Milk",
  description: "One litre",
  categoryId: category._id,
  price: 6500,
  mrp: 7000,
  unit: "1 litre",
  stockQuantity: 10,
  inventoryTrackingEnabled: true,
  availabilityStatus: "AVAILABLE",
  active: true,
});
const payload = () => ({
  shopId: shop._id,
  items: [{ productId: product._id, quantity: 2 }],
  customerName: "Customer",
  phone: "9876543210",
  fulfillmentMethod: "pickup",
  paymentMethod: "PAY_AT_STORE",
  notes: "",
});
const place = (body = payload(), key = crypto.randomUUID()) =>
  request(app)
    .post("/api/orders")
    .set(auth(buyer.token))
    .set("Idempotency-Key", key)
    .send(body);
before(
  async () => {
    mongo = await MongoMemoryReplSet.create({
      replSet: {
        count: 1,
        storageEngine: "wiredTiger",
        configSettings: { electionTimeoutMillis: 10000 },
      },
    });
    await connectDatabase(mongo.getUri());
    app = createApp(env, { storage });
    for (const model of Object.values(mongoose.models)) await model.init();
    admin = await register("admin@test.in");
    await User.findByIdAndUpdate(admin.id, { role: "admin" });
    owner = await register("owner@test.in");
    other = await register("other@test.in");
    buyer = await register("buyer@test.in");
  },
  { timeout: 180000 },
);
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
test("Phase 2: customer applies atomically and becomes a pending shopkeeper", async () => {
  shop = (
    await request(app)
      .post("/api/shops/apply")
      .set(auth(owner.token))
      .send(application("Sharma General Store"))
      .expect(201)
  ).body.shop;
  otherShop = (
    await request(app)
      .post("/api/shops/apply")
      .set(auth(other.token))
      .send(application("Other Store"))
      .expect(201)
  ).body.shop;
  assert.equal(shop.approvalStatus, "PENDING_APPROVAL");
  assert.equal(shop.active, false);
  assert.equal((await User.findById(owner.id)).role, "shopkeeper");
  await request(app)
    .post("/api/shops/apply")
    .set(auth(owner.token))
    .send(application("Duplicate"))
    .expect(409);
  assert.equal(
    (await request(app).get("/api/shops").expect(200)).body.total,
    0,
  );
  await request(app).get(`/api/shops/${shop.slug}`).expect(404);
});
test("Phase 2: owner cannot self-approve or set delivery, admin must verify physically", async () => {
  await request(app)
    .patch(`/api/admin/shops/${shop._id}/approval`)
    .set(auth(owner.token))
    .send({ status: "APPROVED", notes: "verified", physicallyVerified: true })
    .expect(403);
  await request(app)
    .patch(`/api/shops/${shop._id}`)
    .set(auth(owner.token))
    .send({ deliveryEnabled: true })
    .expect(400);
  await request(app)
    .patch(`/api/admin/shops/${shop._id}/approval`)
    .set(auth(admin.token))
    .send({ status: "APPROVED", notes: "verified" })
    .expect(400);
  for (const target of [shop, otherShop])
    await request(app)
      .patch(`/api/admin/shops/${target._id}/approval`)
      .set(auth(admin.token))
      .send({
        status: "APPROVED",
        notes: "Physical visit completed",
        physicallyVerified: true,
      })
      .expect(200);
  assert.equal(
    (await request(app).get("/api/shops?pinCode=411045").expect(200)).body
      .total,
    2,
  );
  assert.equal(
    (await request(app).get("/api/shops?pinCode=110001").expect(200)).body
      .total,
    0,
  );
  assert.equal(
    (await request(app).get(`/api/shops/${shop.slug}`).expect(200)).body.shop
      .verificationNotes,
    undefined,
  );
  assert.equal(await AuditLog.countDocuments({ action: "SHOP_APPROVED" }), 2);
});
test("Phase 3: categories, product creation/editing and cross-shop ownership protection", async () => {
  category = (
    await request(app)
      .post(`/api/shops/${shop._id}/categories`)
      .set(auth(owner.token))
      .send({ name: "Dairy", displayOrder: 0, active: true })
      .expect(201)
  ).body.category;
  await request(app)
    .post(`/api/shops/${shop._id}/products`)
    .set(auth(other.token))
    .send(listing())
    .expect(403);
  product = (
    await request(app)
      .post(`/api/shops/${shop._id}/products`)
      .set(auth(owner.token))
      .send(listing())
      .expect(201)
  ).body.product;
  await request(app)
    .patch(`/api/products/${product._id}`)
    .set(auth(other.token))
    .send(listing())
    .expect(403);
  await request(app)
    .delete(`/api/products/${product._id}`)
    .set(auth(other.token))
    .expect(403);
  await request(app)
    .delete(`/api/categories/${category._id}`)
    .set(auth(owner.token))
    .expect(409);
  await request(app)
    .patch(`/api/products/${product._id}`)
    .set(auth(owner.token))
    .send({ ...listing(), price: 6000 })
    .expect(200);
  assert.equal((await Product.findById(product._id)).price, 6000);
  await request(app)
    .patch(`/api/shops/${otherShop._id}/availability`)
    .set(auth(other.token))
    .send({ ids: [product._id], availabilityStatus: "OUT_OF_STOCK" })
    .expect(403);
});
test("Images: authorize before processing, validate MIME, magic bytes, size and one-image limit", async () => {
  const png = await sharp({
    create: { width: 50, height: 50, channels: 3, background: "green" },
  })
    .png()
    .toBuffer();
  await request(app)
    .post(`/api/images/product/${product._id}`)
    .set(auth(other.token))
    .attach("image", png, { filename: "valid.png", contentType: "image/png" })
    .expect(403);
  await request(app)
    .post(`/api/images/product/${product._id}`)
    .set(auth(buyer.token))
    .attach("image", png, "valid.png")
    .expect(403);
  await request(app)
    .post(`/api/images/product/${product._id}`)
    .set(auth(owner.token))
    .attach("image", Buffer.from("not an image"), {
      filename: "fake.png",
      contentType: "image/png",
    })
    .expect(400);
  await request(app)
    .post(`/api/images/product/${product._id}`)
    .set(auth(owner.token))
    .attach("image", Buffer.from("<svg/>"), {
      filename: "a.svg",
      contentType: "image/svg+xml",
    })
    .expect(400);
  await request(app)
    .post(`/api/images/product/${product._id}`)
    .set(auth(owner.token))
    .attach("image", Buffer.alloc(5 * 1024 * 1024 + 1), {
      filename: "huge.png",
      contentType: "image/png",
    })
    .expect(400);
  await request(app)
    .post(`/api/images/product/${product._id}`)
    .set(auth(owner.token))
    .attach("image", png, "a.png")
    .attach("image", png, "b.png")
    .expect(400);
  assert.equal(uploaded, 0);
});
test("Images: compress before upload, replace safely, retry deletions without deleting current assets", async () => {
  const png = await sharp({
    create: { width: 1800, height: 1400, channels: 3, background: "green" },
  })
    .png()
    .toBuffer();
  const first = (
    await request(app)
      .post(`/api/images/product/${product._id}`)
      .set(auth(owner.token))
      .attach("image", png, "a.png")
      .expect(201)
  ).body.image;
  const second = (
    await request(app)
      .post(`/api/images/product/${product._id}`)
      .set(auth(owner.token))
      .attach("image", png, "b.png")
      .expect(201)
  ).body.image;
  assert.notEqual(first.publicId, second.publicId);
  assert.equal(
    (await Product.findById(product._id)).image.publicId,
    second.publicId,
  );
  assert.equal(
    (await MediaAsset.findOne({ publicId: first.publicId })).state,
    "retired",
  );
  removalFails = true;
  await cleanupImages(storage);
  assert.equal(
    (await MediaAsset.findOne({ publicId: first.publicId })).attempts,
    1,
  );
  removalFails = false;
  await cleanupImages(storage);
  assert.ok(removed.includes(first.publicId));
  assert.ok(!removed.includes(second.publicId));
  await request(app)
    .delete(`/api/images/product/${product._id}`)
    .set(auth(other.token))
    .expect(403);
  await request(app)
    .delete(`/api/images/product/${product._id}`)
    .set(auth(owner.token))
    .expect(204);
  await cleanupImages(storage);
  assert.ok(removed.includes(second.publicId));
  const saved = (await Product.findById(product._id)).toObject();
  assert.equal(saved.image, undefined);
});
test("Images: shared catalog image cannot be deleted by a shopkeeper; per-shop override stays independent", async () => {
  const catalog = (
    await request(app)
      .post("/api/admin/catalog")
      .set(auth(admin.token))
      .send({
        name: "Branded Milk",
        unit: "1 litre",
        barcode: "1234567890123",
        description: "Shared product",
      })
      .expect(201)
  ).body.item;
  await request(app)
    .patch(`/api/products/${product._id}`)
    .set(auth(owner.token))
    .send({ ...listing(), price: 6000, catalogId: catalog._id })
    .expect(200);
  const png = await sharp({
    create: { width: 50, height: 50, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  await request(app)
    .post(`/api/images/catalog/${catalog._id}`)
    .set(auth(owner.token))
    .attach("image", png, "a.png")
    .expect(403);
  const shared = (
    await request(app)
      .post(`/api/images/catalog/${catalog._id}`)
      .set(auth(admin.token))
      .attach("image", png, "a.png")
      .expect(201)
  ).body.image;
  const override = (
    await request(app)
      .post(`/api/images/product/${product._id}`)
      .set(auth(owner.token))
      .attach("image", png, "a.png")
      .expect(201)
  ).body.image;
  await request(app)
    .delete(`/api/images/product/${product._id}`)
    .set(auth(owner.token))
    .expect(204);
  await cleanupImages(storage);
  assert.ok(removed.includes(override.publicId));
  assert.ok(!removed.includes(shared.publicId));
  assert.equal(
    (await CatalogProduct.findById(catalog._id)).image.publicId,
    shared.publicId,
  );
});
test("Phase 5: backend rejects forged prices and computes prices from persistent products", async () => {
  await place({ ...payload(), subtotal: 1 }).expect(400);
  const response = await place().expect(201);
  pickup = response.body.order;
  assert.equal(pickup.subtotal, 12000);
  assert.equal(pickup.totalAmount, 12000);
  assert.equal(pickup.items[0].price, 6000);
  assert.equal(pickup.pickupCodeHash, undefined);
  assert.equal(pickup.pickupCodeEncrypted, undefined);
  assert.equal((await Product.findById(product._id)).stockQuantity, 8);
  assert.equal(await Notification.countDocuments({ recipientId: owner.id }), 1);
});
test("Phase 5: order visibility and verification secrets are scoped to the customer", async () => {
  await request(app)
    .get(`/api/orders/${pickup._id}`)
    .set(auth(other.token))
    .expect(403);
  const ownerView = (
    await request(app)
      .get(`/api/orders/${pickup._id}`)
      .set(auth(owner.token))
      .expect(200)
  ).body.order;
  assert.equal(ownerView.pickupCode, undefined);
  assert.equal(ownerView.pickupCodeEncrypted, undefined);
  const customerView = (
    await request(app)
      .get(`/api/orders/${pickup._id}`)
      .set(auth(buyer.token))
      .expect(200)
  ).body.order;
  assert.match(customerView.pickupCode, /^\d{6}$/);
  const saved = await Order.findById(pickup._id).select(
    "+pickupCodeEncrypted +pickupCodeHash",
  );
  assert.notEqual(saved.pickupCodeEncrypted, customerView.pickupCode);
});
test("Phase 5: transitions reject skips, require rejection reasons and verify pickup before completion", async () => {
  const status = (target, extra = {}) =>
    request(app)
      .patch(`/api/orders/${pickup._id}/status`)
      .set(auth(owner.token))
      .send({ status: target, ...extra });
  await status("COMPLETED").expect(409);
  await status("REJECTED").expect(400);
  await status("ACCEPTED").expect(200);
  await status("PREPARING").expect(200);
  await status("OUT_FOR_DELIVERY").expect(400);
  await status("READY_FOR_PICKUP").expect(200);
  await status("COMPLETED").expect(400);
  await request(app)
    .post(`/api/orders/${pickup._id}/verify-pickup`)
    .set(auth(owner.token))
    .send({ code: "000000" })
    .expect(400);
  const code = (
    await request(app).get(`/api/orders/${pickup._id}`).set(auth(buyer.token))
  ).body.order.pickupCode;
  await request(app)
    .post(`/api/orders/${pickup._id}/verify-pickup`)
    .set(auth(owner.token))
    .send({ code })
    .expect(200);
  await status("PREPARING").expect(409);
  assert.equal((await Order.findById(pickup._id)).paymentStatus, "PAID");
});
test("Phase 5: rejection and cancellation restore reserved stock exactly once", async () => {
  const order = (await place().expect(201)).body.order;
  const stock = (await Product.findById(product._id)).stockQuantity;
  await request(app)
    .patch(`/api/orders/${order._id}/status`)
    .set(auth(owner.token))
    .send({ status: "REJECTED", reason: "Item damaged" })
    .expect(200);
  assert.equal((await Product.findById(product._id)).stockQuantity, stock + 2);
  await request(app)
    .patch(`/api/orders/${order._id}/status`)
    .set(auth(owner.token))
    .send({ status: "REJECTED", reason: "Again" })
    .expect(409);
  const second = (await place().expect(201)).body.order;
  await request(app)
    .patch(`/api/orders/${second._id}/status`)
    .set(auth(buyer.token))
    .send({ status: "CANCELLED", reason: "Changed plans" })
    .expect(200);
  assert.equal((await Product.findById(product._id)).stockQuantity, stock + 2);
});
test("Phase 5: idempotent submission cannot reserve inventory twice", async () => {
  const key = crypto.randomUUID();
  const stock = (await Product.findById(product._id)).stockQuantity;
  const [a, b] = await Promise.all([
    place(payload(), key),
    place(payload(), key),
  ]);
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.equal(a.body.order._id, b.body.order._id);
  assert.equal((await Product.findById(product._id)).stockQuantity, stock - 2);
});
test("Phase 6: delivery permission, PIN eligibility, minimum, configured windows and server fee", async () => {
  const delivery = {
    ...payload(),
    fulfillmentMethod: "delivery",
    paymentMethod: "CASH_ON_DELIVERY",
    deliveryAddress: {
      label: "Home",
      line: "22 Local Road",
      city: "Pune",
      pinCode: "411045",
    },
    deliveryWindow: "Tomorrow 10am–12pm",
  };
  await place(delivery).expect(400);
  await request(app)
    .patch(`/api/admin/shops/${shop._id}/delivery`)
    .set(auth(admin.token))
    .send({
      deliveryEnabled: true,
      deliveryRadiusKm: 5,
      deliveryFee: 2500,
      minimumOrderAmount: 10000,
      deliveryTimeSlots: ["Tomorrow 10am–12pm"],
      serviceablePinCodes: ["411045"],
    })
    .expect(200);
  await place({
    ...delivery,
    deliveryAddress: { ...delivery.deliveryAddress, pinCode: "110001" },
  }).expect(400);
  await place({
    ...delivery,
    items: [{ productId: product._id, quantity: 1 }],
  }).expect(400);
  await place({ ...delivery, deliveryWindow: "Invented time" }).expect(400);
  const order = (await place(delivery).expect(201)).body.order;
  assert.equal(order.deliveryFee, 2500);
  assert.equal(order.totalAmount, 14500);
  for (const status of [
    "ACCEPTED",
    "PREPARING",
    "OUT_FOR_DELIVERY",
    "COMPLETED",
  ])
    await request(app)
      .patch(`/api/orders/${order._id}/status`)
      .set(auth(owner.token))
      .send({ status })
      .expect(200);
});
test("Phase 5: simultaneous orders for last unit never oversell", async () => {
  await Product.findByIdAndUpdate(product._id, { stockQuantity: 1 });
  const body = {
    ...payload(),
    items: [{ productId: product._id, quantity: 1 }],
  };
  const results = await Promise.all([place(body), place(body)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await Product.findById(product._id)).stockQuantity, 0);
  await place(body).expect(409);
});
test("Phase 6: store suspension, user management, manual subscriptions and analytics", async () => {
  const dashboard = (
    await request(app)
      .get("/api/admin/dashboard")
      .set(auth(admin.token))
      .expect(200)
  ).body;
  assert.equal(dashboard.completed, 2);
  assert.equal(dashboard.gmv, 24000);
  assert.equal(dashboard.platformRevenue, 0);
  const analytics = (
    await request(app)
      .get(`/api/shops/${shop._id}/analytics`)
      .set(auth(owner.token))
      .expect(200)
  ).body;
  assert.equal(analytics.completedOrders, 2);
  assert.equal(analytics.todaysSales, 24000);
  await request(app)
    .get(`/api/shops/${shop._id}/analytics`)
    .set(auth(other.token))
    .expect(403);
  await request(app)
    .put(`/api/admin/shops/${shop._id}/subscription`)
    .set(auth(admin.token))
    .send({
      plan: "Starter",
      amount: 49900,
      status: "ACTIVE",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2027-01-01T00:00:00.000Z",
    })
    .expect(200);
  await request(app)
    .patch(`/api/admin/shops/${shop._id}/approval`)
    .set(auth(admin.token))
    .send({ status: "SUSPENDED", notes: "Verification review needed" })
    .expect(200);
  await request(app).get(`/api/shops/${shop.slug}`).expect(404);
  await place().expect(400);
  await request(app)
    .patch(`/api/admin/users/${buyer.id}/status`)
    .set(auth(admin.token))
    .send({ accountStatus: "suspended", reason: "Security review" })
    .expect(200);
  await request(app).get("/api/orders/my").set(auth(buyer.token)).expect(401);
  assert.ok(await AuditLog.countDocuments({ action: "USER_STATUS" }));
});
test("quotes reserve no stock, reject changed totals, and retain historical item snapshots", async () => {
  await request(app)
    .patch(`/api/admin/shops/${shop._id}/approval`)
    .set(auth(admin.token))
    .send({
      status: "APPROVED",
      notes: "Review complete and verified again",
      physicallyVerified: true,
    })
    .expect(200);
  await request(app)
    .patch(`/api/admin/users/${buyer.id}/status`)
    .set(auth(admin.token))
    .send({ accountStatus: "active", reason: "Review complete" })
    .expect(200);
  await Product.findByIdAndUpdate(product._id, { stockQuantity: 5 });
  const quote = (
    await request(app)
      .post("/api/orders/quote")
      .set(auth(buyer.token))
      .send(payload())
      .expect(200)
  ).body.quote;
  assert.equal(quote.totalAmount, 12000);
  assert.equal((await Product.findById(product._id)).stockQuantity, 5);
  await place({ ...payload(), expectedTotalAmount: 1 }).expect(409);
  assert.equal((await Product.findById(product._id)).stockQuantity, 5);
  await Product.findByIdAndUpdate(product._id, {
    name: "Renamed Milk",
    price: 7000,
  });
  const historical = (
    await request(app)
      .get(`/api/orders/${pickup._id}`)
      .set(auth(buyer.token))
      .expect(200)
  ).body.order;
  assert.equal(historical.items[0].name, "Fresh Milk");
  assert.equal(historical.items[0].price, 6000);
  const detail = (
    await request(app).get(`/api/products/${product._id}`).expect(200)
  ).body.product;
  assert.equal(detail.name, "Renamed Milk");
});
test("AVIF input is decoded and resized into a bounded WebP before any provider upload", async () => {
  const avif = await sharp({
    create: { width: 1400, height: 100, channels: 3, background: "green" },
  })
    .avif()
    .toBuffer();
  const optimized = await optimizeImage(avif);
  const info = await sharp(optimized).metadata();
  assert.equal(info.format, "webp");
  assert.equal(info.width, 1200);
  assert.ok(optimized.length < 5 * 1024 * 1024);
});
test("failed provider upload and failed attachment preserve the current image and queue orphan cleanup", async () => {
  const image = await sharp({
    create: { width: 30, height: 30, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const ownerUser = await User.findById(owner.id);
  const current = await replaceImage(
    ownerUser,
    "product",
    product._id,
    image,
    storage,
  );
  uploadFails = true;
  await assert.rejects(() =>
    replaceImage(ownerUser, "product", product._id, image, storage),
  );
  uploadFails = false;
  assert.equal(
    (await Product.findById(product._id)).image.publicId,
    current.publicId,
  );
  const failingAttachment = {
    ...storage,
    upload: async (buffer, key) => {
      const result = await storage.upload(buffer, key);
      await Shop.findByIdAndUpdate(shop._id, { active: false });
      return result;
    },
  };
  await assert.rejects(
    () =>
      replaceImage(ownerUser, "product", product._id, image, failingAttachment),
    (error) => error.status === 403,
  );
  await Shop.findByIdAndUpdate(shop._id, { active: true });
  assert.equal(
    (await Product.findById(product._id)).image.publicId,
    current.publicId,
  );
  await cleanupImages(storage);
  assert.ok(!removed.includes(current.publicId));
});
test("notifications, saved addresses, product requests, disputes and security activity are permission-scoped", async () => {
  const profile = {
    name: "Customer Updated",
    phone: "9876543210",
    addresses: [
      { label: "Home", line: "10 Main Road", city: "Pune", pinCode: "411045" },
    ],
  };
  await request(app)
    .patch("/api/profile")
    .set(auth(buyer.token))
    .send(profile)
    .expect(200);
  assert.equal(
    (await User.findById(buyer.id)).addresses[0].line,
    "10 Main Road",
  );
  const notifications = (
    await request(app)
      .get("/api/notifications")
      .set(auth(buyer.token))
      .expect(200)
  ).body.items;
  assert.ok(notifications.length > 0);
  await request(app)
    .patch(`/api/notifications/${notifications[0]._id}/read`)
    .set(auth(other.token))
    .expect(404);
  const item = (
    await request(app)
      .post("/api/requests")
      .set(auth(buyer.token))
      .send({ shopId: shop._id, message: "Please stock brown bread." })
      .expect(201)
  ).body.request;
  const unresolvedRequests = () =>
    request(app)
      .get(`/api/shops/${shop._id}/requests?resolved=false&limit=1`)
      .set(auth(owner.token));
  const beforeResolved = (await unresolvedRequests().expect(200)).body.total;
  assert.ok(beforeResolved >= 1);
  await request(app)
    .get(`/api/shops/${shop._id}/requests?resolved=false&limit=1`)
    .set(auth(other.token))
    .expect(403);
  await request(app)
    .patch(`/api/requests/${item._id}`)
    .set(auth(other.token))
    .send({ resolved: true })
    .expect(403);
  await request(app)
    .patch(`/api/requests/${item._id}`)
    .set(auth(owner.token))
    .send({ resolved: true })
    .expect(200);
  assert.equal(
    (await unresolvedRequests().expect(200)).body.total,
    beforeResolved - 1,
  );
  await request(app)
    .patch(`/api/requests/${item._id}`)
    .set(auth(owner.token))
    .send({ resolved: false })
    .expect(200);
  assert.equal(
    (await unresolvedRequests().expect(200)).body.total,
    beforeResolved,
  );
  await request(app)
    .post(`/api/admin/orders/${pickup._id}/dispute`)
    .set(auth(admin.token))
    .send({
      resolution: "Contacted both parties and resolved the packaging issue.",
    })
    .expect(200);
  assert.ok(await AuditLog.exists({ action: "DISPUTE_RESOLVED" }));
  await request(app)
    .post("/api/auth/login")
    .send({ email: "unknown@test.in", password: "wrong" })
    .expect(401);
  const security = (
    await request(app)
      .get("/api/admin/security")
      .set(auth(admin.token))
      .expect(200)
  ).body;
  assert.ok(security.total > 0);
  assert.equal(security.items[0].ip, undefined);
  await request(app)
    .get("/api/admin/security")
    .set(auth(buyer.token))
    .expect(403);
});
test("product availability requests notify only their customer and reject unavailable products and duplicate sends", async () => {
  const available = await Product.create({
    shopId: shop._id,
    categoryId: category._id,
    name: "Requested bread",
    price: 5000,
    unit: "pack",
    active: true,
    availabilityStatus: "AVAILABLE",
    inventoryTrackingEnabled: true,
    stockQuantity: 2,
  });
  const item = (
    await request(app)
      .post("/api/requests")
      .set(auth(buyer.token))
      .send({ shopId: shop._id, message: "Please stock bread" })
      .expect(201)
  ).body.request;
  const update = (token, data) =>
    request(app).patch(`/api/requests/${item._id}`).set(auth(token)).send(data);
  const before = await Notification.countDocuments({
    recipientId: buyer.id,
    type: "PRODUCT_AVAILABLE",
  });
  await update(owner.token, { resolved: true }).expect(200);
  assert.equal(
    await Notification.countDocuments({
      recipientId: buyer.id,
      type: "PRODUCT_AVAILABLE",
    }),
    before,
  );
  await update(owner.token, { resolved: false }).expect(200);
  await update(other.token, { resolved: true, productId: available.id }).expect(
    403,
  );
  await update(owner.token, {
    resolved: false,
    productId: available.id,
  }).expect(400);
  await update(owner.token, {
    resolved: true,
    productId: new mongoose.Types.ObjectId().toString(),
  }).expect(400);
  const foreign = await Product.create({
    shopId: otherShop._id,
    categoryId: category._id,
    name: "Other bread",
    price: 5000,
    unit: "pack",
  });
  await update(owner.token, { resolved: true, productId: foreign.id }).expect(
    400,
  );
  for (const changes of [
    { active: false },
    { active: true, availabilityStatus: "OUT_OF_STOCK" },
    { availabilityStatus: "AVAILABLE", stockQuantity: 0 },
  ]) {
    await Product.findByIdAndUpdate(available._id, { $set: changes });
    await update(owner.token, {
      resolved: true,
      productId: available.id,
    }).expect(400);
  }
  await Product.findByIdAndUpdate(available._id, {
    $set: { stockQuantity: 2 },
  });
  const results = await Promise.all([
    update(owner.token, { resolved: true, productId: available.id }),
    update(owner.token, { resolved: true, productId: available.id }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal(
    await Notification.countDocuments({
      recipientId: buyer.id,
      type: "PRODUCT_AVAILABLE",
    }),
    before + 1,
  );
  const inbox = (
    await request(app)
      .get("/api/notifications?read=false&limit=100")
      .set(auth(buyer.token))
      .expect(200)
  ).body;
  const notice = inbox.items.find((entry) => entry.productId === available.id);
  assert.ok(notice);
  assert.equal(notice.shopSlug, shop.slug);
  assert.ok(notice.message.includes(available.name));
  await request(app)
    .patch(`/api/notifications/${notice._id}/read`)
    .set(auth(other.token))
    .expect(404);
  await request(app)
    .patch(`/api/notifications/${notice._id}/read`)
    .set(auth(buyer.token))
    .expect(200);
  const afterRead = (
    await request(app)
      .get("/api/notifications?read=false&limit=100")
      .set(auth(buyer.token))
      .expect(200)
  ).body;
  assert.equal(afterRead.total, inbox.total - 1);
  await Product.deleteMany({
    _id: mongoose.trusted({ $in: [available._id, foreign._id] }),
  });
});
test("optional MRP and availability-only inventory work while out-of-stock and archived listings are blocked", async () => {
  const item = (
    await request(app)
      .post(`/api/shops/${shop._id}/products`)
      .set(auth(owner.token))
      .send({
        ...listing(),
        name: "Everyday Bread",
        price: 5000,
        mrp: null,
        inventoryTrackingEnabled: false,
        stockQuantity: 0,
        availabilityStatus: "CONFIRM_AVAILABILITY",
      })
      .expect(201)
  ).body.product;
  const body = { ...payload(), items: [{ productId: item._id, quantity: 2 }] };
  await place(body).expect(201);
  assert.equal((await Product.findById(item._id)).stockQuantity, 0);
  await request(app)
    .patch(`/api/shops/${shop._id}/availability`)
    .set(auth(owner.token))
    .send({ ids: [item._id], availabilityStatus: "OUT_OF_STOCK" })
    .expect(200);
  await place(body).expect(409);
  await request(app)
    .delete(`/api/products/${item._id}`)
    .set(auth(owner.token))
    .expect(200);
  await request(app).get(`/api/products/${item._id}`).expect(404);
});
test("missing Cloudinary configuration fails explicitly without saving an upload asset", async () => {
  const isolated = createApp(env);
  const count = await MediaAsset.countDocuments();
  const image = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  const response = await request(isolated)
    .post(`/api/images/product/${product._id}`)
    .set(auth(owner.token))
    .attach("image", image, "photo.png")
    .expect(503);
  assert.match(response.body.message, /Cloudinary/);
  assert.equal(await MediaAsset.countDocuments(), count);
});
test(
  "combined production hosting serves SPA deep links with CDN image CSP and preserves JSON API 404s",
  {
    skip: !fs.existsSync(
      new URL("../../client/dist/index.html", import.meta.url),
    ),
  },
  async () => {
    const combined = createApp({ ...env, SERVE_CLIENT: true });
    const page = await request(combined).get("/shop/deep-link").expect(200);
    assert.match(page.text, /<div id="root">/);
    assert.match(
      page.headers["content-security-policy"],
      /img-src 'self' https:\/\/res.cloudinary.com data:/,
    );
    const missing = await request(combined).get("/api/not-a-route").expect(404);
    assert.equal(missing.body.message, "Resource not found.");
  },
);
test("manual subscription values can be reloaded only by an administrator", async () => {
  const response = await request(app)
    .get(`/api/admin/shops/${shop._id}/subscription`)
    .set(auth(admin.token))
    .expect(200);
  assert.equal(response.body.subscription.plan, "Starter");
  assert.equal(response.body.subscription.amount, 49900);
  await request(app)
    .get(`/api/admin/shops/${shop._id}/subscription`)
    .set(auth(buyer.token))
    .expect(403);
});
test("administrative bulk product changes create an atomic audit record", async () => {
  await request(app)
    .patch(`/api/shops/${shop._id}/availability`)
    .set(auth(admin.token))
    .send({ ids: [product._id], availabilityStatus: "CONFIRM_AVAILABILITY" })
    .expect(200);
  const log = await AuditLog.findOne({ action: "PRODUCT_BULK_AVAILABILITY" });
  assert.equal(String(log.actorId), admin.id);
  assert.equal(log.metadata.ids[0], product._id);
  assert.equal(
    (await Product.findById(product._id)).availabilityStatus,
    "CONFIRM_AVAILABILITY",
  );
});
test("shop orders separate active and past orders before pagination and sort the queue oldest first", async () => {
  const all = await Order.find({ shopId: shop._id }).sort({
    createdAt: 1,
    _id: 1,
  });
  const terminal = ["COMPLETED", "REJECTED", "CANCELLED"];
  const active = all.filter((order) => !terminal.includes(order.orderStatus));
  const past = all
    .filter((order) => terminal.includes(order.orderStatus))
    .reverse();
  assert.ok(active.length > 0);
  assert.ok(past.length > 0);
  for (const [section, expected, sort] of [
    ["incoming", active, "oldest"],
    ["past", past, "newest"],
  ]) {
    for (let index = 0; index < expected.length; index++) {
      const result = (
        await request(app)
          .get(
            `/api/shops/${shop._id}/orders?section=${section}&sort=${sort}&limit=1&page=${index + 1}`,
          )
          .set(auth(owner.token))
          .expect(200)
      ).body;
      assert.equal(result.total, expected.length);
      assert.equal(result.items[0]._id, expected[index].id);
    }
  }
});
test("stock of ten rejects a quantity of eleven in both quote and order without reserving inventory", async () => {
  const previous = await Product.findById(product._id);
  try {
    await Product.findByIdAndUpdate(product._id, {
      stockQuantity: 10,
      inventoryTrackingEnabled: true,
      availabilityStatus: "AVAILABLE",
    });
    const body = {
      ...payload(),
      items: [{ productId: product._id, quantity: 11 }],
    };
    await request(app)
      .post("/api/orders/quote")
      .set(auth(buyer.token))
      .send(body)
      .expect(409);
    await place(body).expect(409);
    assert.equal((await Product.findById(product._id)).stockQuantity, 10);
    const result = await request(app)
      .get(`/api/shops/${shop._id}/products?ids=${product._id}&limit=100`)
      .expect(200);
    assert.equal(result.body.items.length, 1);
    assert.equal(result.body.items[0].stockQuantity, 10);
  } finally {
    await Product.findByIdAndUpdate(product._id, {
      stockQuantity: previous.stockQuantity,
      inventoryTrackingEnabled: previous.inventoryTrackingEnabled,
      availabilityStatus: previous.availabilityStatus,
    });
  }
});
