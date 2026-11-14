import { before, after, beforeEach, test } from "node:test";
import "./helpers/mongo.js";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../app.js";
import { connectDatabase } from "../config/database.js";
import { User } from "../models/User.js";
import { Shop, Notification } from "../models/marketplace.js";
import {
  ClassSession,
  ClassBooking,
  BarberTicket,
} from "../models/bookings.js";
import { nextIndiaMidnight } from "../routes/bookings.js";

let mongo, app, teacher, barber, stranger, customers, studio, salon;
const env = {
  JWT_SECRET: "booking-tests-secret-longer-than-thirty-two-characters",
  CLIENT_URL: "http://localhost:5173",
  NODE_ENV: "test",
};
const auth = (user) => ({
  Authorization: `Bearer ${jwt.sign({}, env.JWT_SECRET, { subject: user.id, issuer: "localcart", audience: "localcart-client", expiresIn: "1h" })}`,
});
const details = (extra = {}) => ({
  title: "Morning yoga",
  discipline: "YOGA",
  description: "Beginner online yoga",
  startsAt: new Date(Date.now() + 3600000).toISOString(),
  endsAt: new Date(Date.now() + 7200000).toISOString(),
  capacity: 2,
  joinUrl: "https://meet.example.com/private-yoga",
  ...extra,
});
const createClass = async (extra = {}) =>
  (
    await request(app)
      .post(`/api/shops/${studio.id}/class-sessions`)
      .set(auth(teacher))
      .send(details(extra))
      .expect(201)
  ).body.session;
const book = (item, user) =>
  request(app).post(`/api/class-sessions/${item._id}/book`).set(auth(user));
const join = (user) =>
  request(app).post(`/api/shops/${salon.id}/barber-queue/join`).set(auth(user));
const change = (ticket, user, status, reason) =>
  request(app)
    .patch(`/api/barber-bookings/${ticket._id}`)
    .set(auth(user))
    .send({ status, ...(reason ? { reason } : {}) });
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
    app = createApp(env);
    for (const model of Object.values(mongoose.models)) await model.init();
    const people = await User.create(
      [
        "teacher",
        "barber",
        "stranger",
        "customer1",
        "customer2",
        "customer3",
      ].map((name, index) => ({
        name,
        email: `${name}@bookings.test`,
        phone: "9876543210",
        passwordHash: "not-used-in-these-token-tests",
        role: index < 3 ? "shopkeeper" : "customer",
      })),
    );
    [teacher, barber, stranger] = people;
    customers = people.slice(3);
    [studio, salon] = await Shop.create([
      {
        ownerId: teacher.id,
        name: "Online studio",
        slug: "studio",
        category: "Yoga",
        businessType: "CLASSES",
        approvalStatus: "APPROVED",
        active: true,
      },
      {
        ownerId: barber.id,
        name: "Neighbour salon",
        slug: "salon",
        category: "Barber",
        businessType: "BARBER",
        approvalStatus: "APPROVED",
        active: true,
      },
    ]);
  },
  { timeout: 180000 },
);
beforeEach(async () => {
  await Promise.all([
    ClassSession.deleteMany({}),
    ClassBooking.deleteMany({}),
    BarberTicket.deleteMany({}),
    Notification.deleteMany({}),
  ]);
  await Shop.updateMany(
    {},
    {
      $set: {
        active: true,
        approvalStatus: "APPROVED",
        barberQueueOpen: true,
        temporarilyClosed: false,
        openingHours: [],
        barberSequence: 0,
      },
    },
  );
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test("public class discovery filters type, shows seats and never exposes meeting links or participants", async () => {
  await createClass();
  await createClass({ discipline: "GYM", title: "Strength training" });
  const result = (
    await request(app).get("/api/class-sessions?discipline=YOGA").expect(200)
  ).body;
  assert.equal(result.total, 1);
  assert.equal(result.items[0].capacity, 2);
  assert.equal(result.items[0].reservedSeats, 0);
  assert.equal(result.items[0].shopId.name, studio.name);
  assert.equal(result.items[0].joinUrl, undefined);
  assert.equal(
    (
      await request(app)
        .get(`/api/shops/${studio.id}/class-sessions`)
        .expect(200)
    ).body.items[0].joinUrl,
    undefined,
  );
  await request(app)
    .get(`/api/class-sessions/${result.items[0]._id}/attendees`)
    .set(auth(customers[0]))
    .expect(403);
  await Shop.findByIdAndUpdate(studio.id, { active: false });
  assert.equal(
    (await request(app).get("/api/class-sessions").expect(200)).body.total,
    0,
  );
});

test("class scheduling validates ownership, type, HTTPS links, capacity and future timing", async () => {
  await request(app)
    .post(`/api/shops/${studio.id}/class-sessions`)
    .send(details())
    .expect(401);
  await request(app)
    .post(`/api/shops/${studio.id}/class-sessions`)
    .set(auth(stranger))
    .send(details())
    .expect(403);
  await request(app)
    .post(`/api/shops/${studio.id}/class-sessions`)
    .set(auth(customers[0]))
    .send(details())
    .expect(403);
  await request(app)
    .post(`/api/shops/${salon.id}/class-sessions`)
    .set(auth(barber))
    .send(details())
    .expect(400);
  for (const extra of [
    { capacity: 0 },
    { capacity: 1.5 },
    { joinUrl: "javascript:alert(1)" },
    { joinUrl: "http://meet.example.com" },
    { endsAt: new Date(Date.now() - 1000).toISOString() },
    { startsAt: new Date(Date.now() - 1000).toISOString() },
  ]) {
    await request(app)
      .post(`/api/shops/${studio.id}/class-sessions`)
      .set(auth(teacher))
      .send(details(extra))
      .expect(400);
  }
});

test("concurrent class bookings cannot oversell; cancellation releases a seat and links remain customer-scoped", async () => {
  const item = await createClass({ capacity: 1 });
  const results = await Promise.all(
    customers.slice(0, 2).map((user) => book(item, user)),
  );
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  const winner =
    customers[results.findIndex((result) => result.status === 201)];
  const loser = customers.find((user) => user.id !== winner.id);
  const booking = results.find((result) => result.status === 201).body.booking;
  assert.equal((await ClassSession.findById(item._id)).reservedSeats, 1);
  await book(item, winner).expect(409);
  const mine = (
    await request(app)
      .get("/api/class-bookings/my")
      .set(auth(winner))
      .expect(200)
  ).body.items;
  assert.equal(mine[0].sessionId.joinUrl, item.joinUrl);
  assert.equal(
    (
      await request(app)
        .get("/api/class-bookings/my")
        .set(auth(loser))
        .expect(200)
    ).body.total,
    0,
  );
  await request(app)
    .patch(`/api/class-bookings/${booking._id}/cancel`)
    .set(auth(loser))
    .expect(404);
  await request(app)
    .patch(`/api/class-bookings/${booking._id}/cancel`)
    .set(auth(winner))
    .expect(200);
  await request(app)
    .patch(`/api/class-bookings/${booking._id}/cancel`)
    .set(auth(winner))
    .expect(200);
  assert.equal((await ClassSession.findById(item._id)).reservedSeats, 0);
  assert.equal(
    (
      await request(app)
        .get("/api/class-bookings/my")
        .set(auth(winner))
        .expect(200)
    ).body.items[0].sessionId.joinUrl,
    undefined,
  );
  await book(item, loser).expect(201);
  assert.equal((await ClassSession.findById(item._id)).reservedSeats, 1);
});

test("owner cancellation closes all class bookings, removes links and sends one cancellation per participant", async () => {
  const item = await createClass();
  await book(item, customers[0]).expect(201);
  await book(item, customers[1]).expect(201);
  await request(app)
    .get(`/api/class-sessions/${item._id}/attendees`)
    .set(auth(stranger))
    .expect(403);
  const roster = (
    await request(app)
      .get(`/api/class-sessions/${item._id}/attendees`)
      .set(auth(teacher))
      .expect(200)
  ).body;
  assert.equal(roster.total, 2);
  assert.equal(roster.items[0].customerId, undefined);
  await request(app)
    .patch(`/api/class-sessions/${item._id}/cancel`)
    .set(auth(stranger))
    .expect(403);
  await request(app)
    .patch(`/api/class-sessions/${item._id}/cancel`)
    .set(auth(teacher))
    .expect(200);
  await request(app)
    .patch(`/api/class-sessions/${item._id}/cancel`)
    .set(auth(teacher))
    .expect(200);
  assert.equal(await ClassBooking.countDocuments({ status: "CONFIRMED" }), 0);
  assert.equal(
    await Notification.countDocuments({
      type: "BOOKING_UPDATE",
      bookingStatus: "CANCELLED",
    }),
    2,
  );
  await book(item, customers[2]).expect(409);
  const mine = (
    await request(app)
      .get("/api/class-bookings/my")
      .set(auth(customers[0]))
      .expect(200)
  ).body.items[0];
  assert.equal(mine.status, "CANCELLED");
  assert.equal(mine.sessionId.joinUrl, undefined);
});

test("barber queue numbers are ordered, private, and positions one and two carry the arrival alert", async () => {
  for (const user of customers) await join(user).expect(201);
  for (let index = 0; index < customers.length; index++) {
    const ticket = (
      await request(app)
        .get("/api/barber-bookings/my")
        .set(auth(customers[index]))
        .expect(200)
    ).body.items[0];
    assert.equal(ticket.number, index + 1);
    assert.equal(ticket.position, index + 1);
    assert.equal(ticket.arriveNow, index < 2);
  }
  const publicQueue = (
    await request(app).get(`/api/shops/${salon.id}/barber-queue`).expect(200)
  ).body;
  assert.deepEqual(publicQueue, { waiting: 3, serving: null, accepting: true });
  await request(app)
    .get(`/api/manage/shops/${salon.id}/barber-queue`)
    .set(auth(customers[0]))
    .expect(403);
  await request(app)
    .get(`/api/manage/shops/${salon.id}/barber-queue`)
    .set(auth(stranger))
    .expect(403);
});

test("duplicate queue joins are rejected atomically", async () => {
  const results = await Promise.all([join(customers[0]), join(customers[0])]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  assert.equal(await BarberTicket.countDocuments({ status: "WAITING" }), 1);
  assert.equal((await Shop.findById(salon.id)).barberSequence, 1);
});

test("barber starts only the next customer, completes one ongoing job, rejects absentees and advances waiting positions", async () => {
  const tickets = [];
  for (const user of customers)
    tickets.push((await join(user).expect(201)).body.ticket);
  await change(tickets[1], barber, "ONGOING").expect(409);
  await change(tickets[0], stranger, "ONGOING").expect(403);
  await change(tickets[0], customers[0], "ONGOING").expect(409);
  await change(tickets[0], barber, "COMPLETED").expect(409);
  const started = await Promise.all([
    change(tickets[0], barber, "ONGOING"),
    change(tickets[0], barber, "ONGOING"),
  ]);
  assert.deepEqual(started.map((result) => result.status).sort(), [200, 409]);
  await change(tickets[1], barber, "ONGOING").expect(409);
  assert.equal(
    (
      await request(app)
        .get("/api/barber-bookings/my")
        .set(auth(customers[2]))
        .expect(200)
    ).body.items[0].position,
    2,
  );
  await change(tickets[1], barber, "REJECTED").expect(409);
  await change(
    tickets[1],
    barber,
    "REJECTED",
    "Customer not present when called",
  ).expect(200);
  await change(tickets[0], barber, "COMPLETED").expect(200);
  await change(tickets[2], barber, "ONGOING").expect(200);
  assert.equal(await BarberTicket.countDocuments({ status: "ONGOING" }), 1);
  const history = (
    await request(app)
      .get(`/api/manage/shops/${salon.id}/barber-history`)
      .set(auth(barber))
      .expect(200)
  ).body;
  assert.equal(history.total, 2);
});

test("customers can cancel only their own waiting tickets and old tickets expire at India midnight", async () => {
  assert.equal(
    nextIndiaMidnight(new Date("2026-11-14T18:29:59Z")).toISOString(),
    "2026-11-14T18:30:00.000Z",
  );
  assert.equal(
    nextIndiaMidnight(new Date("2026-11-14T18:30:01Z")).toISOString(),
    "2026-11-15T18:30:00.000Z",
  );
  const first = (await join(customers[0]).expect(201)).body.ticket;
  await change(first, customers[1], "CANCELLED").expect(403);
  await BarberTicket.findByIdAndUpdate(first._id, {
    expiresAt: new Date(Date.now() - 1000),
  });
  const mine = (
    await request(app)
      .get("/api/barber-bookings/my")
      .set(auth(customers[0]))
      .expect(200)
  ).body.items[0];
  assert.equal(mine.status, "EXPIRED");
  assert.equal(mine.position, null);
  assert.equal(mine.arriveNow, false);
  await change(first, barber, "ONGOING").expect(409);
  const next = (await join(customers[0]).expect(201)).body.ticket;
  assert.equal(next.number, 2);
  assert.equal((await BarberTicket.findById(first._id)).status, "EXPIRED");
  await change(next, customers[0], "CANCELLED").expect(200);
  assert.equal(
    (await request(app).get(`/api/shops/${salon.id}/barber-queue`).expect(200))
      .body.waiting,
    0,
  );
});

test("closed or suspended businesses stop accepting bookings; business type cannot change with active appointments", async () => {
  const item = await createClass();
  await request(app)
    .patch(`/api/shops/${studio.id}`)
    .set(auth(teacher))
    .send({ businessType: "BARBER" })
    .expect(409);
  await Shop.findByIdAndUpdate(studio.id, { active: false });
  await book(item, customers[0]).expect(404);
  await request(app)
    .patch(`/api/shops/${salon.id}`)
    .set(auth(barber))
    .send({ barberQueueOpen: false })
    .expect(200);
  await join(customers[0]).expect(409);
  await Shop.findByIdAndUpdate(salon.id, { barberQueueOpen: true });
  await join(customers[0]).expect(201);
  await request(app)
    .patch(`/api/shops/${salon.id}`)
    .set(auth(barber))
    .send({ businessType: "CLASSES" })
    .expect(409);
  await Shop.findByIdAndUpdate(salon.id, { temporarilyClosed: true });
  await join(customers[1]).expect(409);
});
