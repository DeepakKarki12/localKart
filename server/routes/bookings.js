import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { authenticate, requireRole } from "../middleware/auth.js";
import { ownShop, publicShop } from "../middleware/ownership.js";
import { Shop, Notification } from "../models/marketplace.js";
import {
  ClassSession,
  ClassBooking,
  BarberTicket,
} from "../models/bookings.js";
import { fail, objectId, paged } from "../utils/http.js";
import { openingState } from "../../shared/opening-hours.js";

const future = () => mongoose.trusted({ $gt: new Date() });
const sessionSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    discipline: z.enum(["TEACHING", "GYM", "YOGA"]),
    description: z.string().trim().max(1000).default(""),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    capacity: z.number().int().min(1).max(1000),
    joinUrl: z
      .string()
      .trim()
      .url("Enter a valid meeting link.")
      .max(2000)
      .refine((value) => {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password;
      }, "Use a secure HTTPS meeting link."),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Date(value.startsAt) <= new Date())
      context.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: "Choose a start time in the future (India time).",
      });
    if (new Date(value.endsAt) <= new Date(value.startsAt))
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "The end time must be after the start time.",
      });
  });

// Waiting tickets expire at midnight in India; an ongoing job can still be finished.
export function nextIndiaMidnight(now = new Date()) {
  const shifted = new Date(now.getTime() + 330 * 60000);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() + 1,
    ) -
      330 * 60000,
  );
}
function ticketValue(ticket, position = null) {
  const value = ticket.toObject ? ticket.toObject() : { ...ticket };
  if (value.status === "WAITING" && new Date(value.expiresAt) <= new Date())
    value.status = "EXPIRED";
  return {
    ...value,
    position: value.status === "WAITING" ? position : null,
    arriveNow: value.status === "WAITING" && position != null && position <= 2,
  };
}
async function notification(customerId, title, status, session) {
  await Notification.create(
    [
      {
        recipientId: customerId,
        type: "BOOKING_UPDATE",
        bookingTitle: title,
        bookingStatus: status,
        message: `Booking update: ${title} · ${status.toLowerCase().replaceAll("_", " ")}.`,
      },
    ],
    { session },
  );
}
async function broadcast(req, shopId, customerId) {
  const io = req.app.get("io");
  if (!io) return;
  try {
    const shop = await Shop.findById(shopId);
    const tickets = await BarberTicket.find({
      shopId,
      status: mongoose.trusted({ $in: ["WAITING", "ONGOING"] }),
    }).select("customerId");
    const recipients = new Set([
      String(shop.ownerId),
      String(customerId),
      ...tickets.map((ticket) => String(ticket.customerId)),
    ]);
    for (const recipient of recipients)
      io.to(recipient).emit("bookings:changed", { shopId });
  } catch (error) {
    console.error("Booking socket update failed:", error.name);
  }
}
async function typedShop(user, shopId, type, session) {
  const shop = await ownShop(user, shopId, { session });
  if (shop.businessType !== type)
    fail(400, "This booking type is not enabled for this business.");
  return shop;
}
async function lockPublicShop(shopId, type, session) {
  const shop = await Shop.findOneAndUpdate(
    {
      _id: objectId(shopId),
      businessType: type,
      approvalStatus: "APPROVED",
      active: true,
    },
    { $inc: { revision: 1 } },
    { session, new: true },
  );
  if (!shop) fail(404, "This business is not available for bookings.");
  return shop;
}

export function bookingRoutes(env) {
  const router = Router();
  const auth = authenticate(env.JWT_SECRET);
  const customer = requireRole("customer");
  const owner = requireRole("shopkeeper", "admin");

  router.get("/class-sessions", async (req, res) => {
    const shops = await Shop.find({
      businessType: "CLASSES",
      approvalStatus: "APPROVED",
      active: true,
    }).select("_id");
    const filter = {
      shopId: mongoose.trusted({ $in: shops.map((shop) => shop._id) }),
      cancelled: false,
      startsAt: future(),
    };
    if (req.query.discipline)
      filter.discipline = z
        .enum(["TEACHING", "GYM", "YOGA"])
        .parse(req.query.discipline);
    res.json(
      await paged(ClassSession, filter, req.query, {
        sort: { startsAt: 1, _id: 1 },
        populate: { path: "shopId", select: "name slug city" },
      }),
    );
  });
  router.get("/shops/:shopId/class-sessions", async (req, res) => {
    const shop = await publicShop(req.params.shopId);
    if (shop.businessType !== "CLASSES")
      fail(404, "Classes are not available here.");
    res.json(
      await paged(
        ClassSession,
        { shopId: shop._id, cancelled: false, startsAt: future() },
        req.query,
        { sort: { startsAt: 1, _id: 1 } },
      ),
    );
  });
  router.get(
    "/manage/shops/:shopId/class-sessions",
    auth,
    owner,
    async (req, res) => {
      await typedShop(req.user, req.params.shopId, "CLASSES");
      res.json(
        await paged(ClassSession, { shopId: req.params.shopId }, req.query, {
          sort: { startsAt: -1, _id: -1 },
          select: "+joinUrl",
        }),
      );
    },
  );
  router.post(
    "/shops/:shopId/class-sessions",
    auth,
    owner,
    async (req, res) => {
      const values = sessionSchema.parse(req.body);
      let item;
      await mongoose.connection.transaction(async (session) => {
        const shop = await typedShop(
          req.user,
          req.params.shopId,
          "CLASSES",
          session,
        );
        await Shop.updateOne(
          { _id: shop._id },
          { $inc: { revision: 1 } },
          { session },
        );
        [item] = await ClassSession.create([{ ...values, shopId: shop._id }], {
          session,
        });
      });
      res.status(201).json({ session: item });
    },
  );
  router.get("/class-sessions/:id/attendees", auth, owner, async (req, res) => {
    const item = await ClassSession.findById(objectId(req.params.id));
    if (!item) fail(404, "Class not found.");
    await ownShop(req.user, item.shopId);
    res.json(
      await paged(
        ClassBooking,
        { sessionId: item._id, status: "CONFIRMED" },
        req.query,
        { select: "customerName createdAt status", sort: { createdAt: 1 } },
      ),
    );
  });
  router.patch("/class-sessions/:id/cancel", auth, owner, async (req, res) => {
    let item;
    await mongoose.connection.transaction(async (session) => {
      item = await ClassSession.findById(objectId(req.params.id)).session(
        session,
      );
      if (!item) fail(404, "Class not found.");
      await ownShop(req.user, item.shopId, { session });
      if (item.cancelled) return;
      if (item.endsAt <= new Date()) fail(409, "This class has already ended.");
      const bookings = await ClassBooking.find({
        sessionId: item._id,
        status: "CONFIRMED",
      }).session(session);
      item.cancelled = true;
      item.reservedSeats = 0;
      await item.save({ session });
      await ClassBooking.updateMany(
        { sessionId: item._id, status: "CONFIRMED" },
        { $set: { status: "CANCELLED" } },
        { session },
      );
      for (const booking of bookings)
        await notification(
          booking.customerId,
          item.title,
          "CANCELLED",
          session,
        );
    });
    const io = req.app.get("io");
    // Notify affected participants after commit, including cancelled bookings.
    if (io) {
      const bookings = await ClassBooking.find({ sessionId: item._id }).select(
        "customerId",
      );
      for (const booking of bookings)
        io.to(String(booking.customerId)).emit("bookings:changed", {
          shopId: item.shopId,
        });
    }
    res.json({ session: item });
  });
  router.post("/class-sessions/:id/book", auth, customer, async (req, res) => {
    let booking;
    await mongoose.connection.transaction(async (session) => {
      const item = await ClassSession.findById(objectId(req.params.id)).session(
        session,
      );
      if (!item) fail(404, "Class not found.");
      const shop = await lockPublicShop(item.shopId, "CLASSES", session);
      if (
        shop.temporarilyClosed ||
        item.cancelled ||
        item.startsAt <= new Date()
      )
        fail(409, "This class is not accepting bookings.");
      const previous = await ClassBooking.findOne({
        sessionId: item._id,
        customerId: req.user.id,
      }).session(session);
      if (previous?.status === "CONFIRMED")
        fail(409, "You already have a seat in this class.");
      if (item.reservedSeats >= item.capacity) fail(409, "This class is full.");
      item.reservedSeats += 1;
      await item.save({ session });
      booking = await ClassBooking.findOneAndUpdate(
        { sessionId: item._id, customerId: req.user.id },
        {
          $set: {
            shopId: item.shopId,
            customerName: req.user.name,
            status: "CONFIRMED",
          },
        },
        { upsert: true, new: true, session, runValidators: true },
      );
      await notification(req.user.id, item.title, "CONFIRMED", session);
    });
    await broadcast(req, booking.shopId, req.user.id);
    res.status(201).json({ booking });
  });
  router.get("/class-bookings/my", auth, customer, async (req, res) => {
    const result = await paged(
      ClassBooking,
      { customerId: req.user.id },
      req.query,
      {
        populate: [
          { path: "sessionId", select: "+joinUrl" },
          { path: "shopId", select: "name slug active approvalStatus" },
        ],
      },
    );
    result.items = result.items.map((item) => {
      const value = item.toObject();
      if (
        value.sessionId &&
        (value.status !== "CONFIRMED" ||
          value.sessionId.cancelled ||
          new Date(value.sessionId.endsAt) <= new Date() ||
          !value.shopId?.active ||
          value.shopId.approvalStatus !== "APPROVED")
      )
        delete value.sessionId.joinUrl;
      return value;
    });
    res.json(result);
  });
  router.patch(
    "/class-bookings/:id/cancel",
    auth,
    customer,
    async (req, res) => {
      let booking;
      await mongoose.connection.transaction(async (session) => {
        booking = await ClassBooking.findOne({
          _id: objectId(req.params.id),
          customerId: req.user.id,
        }).session(session);
        if (!booking) fail(404, "Booking not found.");
        if (booking.status === "CANCELLED") return;
        const item = await ClassSession.findById(booking.sessionId).session(
          session,
        );
        if (!item || item.startsAt <= new Date())
          fail(409, "This class has already started.");
        booking.status = "CANCELLED";
        item.reservedSeats = Math.max(0, item.reservedSeats - 1);
        await item.save({ session });
        await booking.save({ session });
        await notification(req.user.id, item.title, "CANCELLED", session);
      });
      await broadcast(req, booking.shopId, req.user.id);
      res.json({ booking });
    },
  );

  router.get("/shops/:shopId/barber-queue", async (req, res) => {
    const shop = await publicShop(req.params.shopId);
    if (shop.businessType !== "BARBER")
      fail(404, "Barber bookings are not available here.");
    const waiting = await BarberTicket.countDocuments({
      shopId: shop._id,
      status: "WAITING",
      expiresAt: future(),
    });
    const ongoing = await BarberTicket.findOne({
      shopId: shop._id,
      status: "ONGOING",
    }).select("number");
    res.json({
      waiting,
      serving: ongoing?.number || null,
      accepting: shop.barberQueueOpen && openingState(shop).open,
    });
  });
  router.get(
    "/manage/shops/:shopId/barber-queue",
    auth,
    owner,
    async (req, res) => {
      const shop = await typedShop(req.user, req.params.shopId, "BARBER");
      const filter = {
        shopId: shop._id,
        $or: [
          { status: "WAITING", expiresAt: future() },
          { status: "ONGOING" },
        ],
      };
      const items = await BarberTicket.find(filter).sort({ number: 1 });
      const waiting = items.filter((item) => item.status === "WAITING");
      res.json({
        accepting: shop.barberQueueOpen,
        items: items.map((item) =>
          ticketValue(
            item,
            waiting.findIndex((ticket) => ticket.id === item.id) + 1,
          ),
        ),
      });
    },
  );
  router.get(
    "/manage/shops/:shopId/barber-history",
    auth,
    owner,
    async (req, res) => {
      await typedShop(req.user, req.params.shopId, "BARBER");
      const result = await paged(
        BarberTicket,
        {
          shopId: req.params.shopId,
          $or: [
            { status: mongoose.trusted({ $nin: ["WAITING", "ONGOING"] }) },
            {
              status: "WAITING",
              expiresAt: mongoose.trusted({ $lte: new Date() }),
            },
          ],
        },
        req.query,
      );
      result.items = result.items.map((item) => ticketValue(item));
      res.json(result);
    },
  );
  router.post(
    "/shops/:shopId/barber-queue/join",
    auth,
    customer,
    async (req, res) => {
      let ticket;
      await mongoose.connection.transaction(async (session) => {
        const shop = await lockPublicShop(req.params.shopId, "BARBER", session);
        if (!shop.barberQueueOpen || !openingState(shop).open)
          fail(409, "This barber is not accepting bookings right now.");
        await BarberTicket.updateMany(
          {
            shopId: shop._id,
            status: "WAITING",
            expiresAt: mongoose.trusted({ $lte: new Date() }),
          },
          { $set: { status: "EXPIRED" } },
          { session },
        );
        if (
          await BarberTicket.exists({
            shopId: shop._id,
            customerId: req.user.id,
            status: mongoose.trusted({ $in: ["WAITING", "ONGOING"] }),
          }).session(session)
        )
          fail(409, "You already have an active appointment here.");
        shop.barberSequence += 1;
        await shop.save({ session });
        [ticket] = await BarberTicket.create(
          [
            {
              shopId: shop._id,
              customerId: req.user.id,
              customerName: req.user.name,
              number: shop.barberSequence,
              expiresAt: nextIndiaMidnight(),
            },
          ],
          { session },
        );
        await notification(req.user.id, shop.name, "WAITING", session);
      });
      await broadcast(req, ticket.shopId, req.user.id);
      res.status(201).json({ ticket });
    },
  );
  router.get("/barber-bookings/my", auth, customer, async (req, res) => {
    const result = await paged(
      BarberTicket,
      { customerId: req.user.id },
      req.query,
      {
        populate: {
          path: "shopId",
          select: "name slug address city active approvalStatus",
        },
      },
    );
    result.items = await Promise.all(
      result.items.map(async (item) => {
        const position =
          item.status === "WAITING" && item.expiresAt > new Date()
            ? 1 +
              (await BarberTicket.countDocuments({
                shopId: item.shopId?._id,
                status: "WAITING",
                expiresAt: future(),
                number: mongoose.trusted({ $lt: item.number }),
              }))
            : null;
        return ticketValue(item, position);
      }),
    );
    res.json(result);
  });
  router.patch("/barber-bookings/:id", auth, async (req, res) => {
    const values = z
      .object({
        status: z.enum(["ONGOING", "COMPLETED", "REJECTED", "CANCELLED"]),
        reason: z.string().trim().min(3).max(300).optional(),
      })
      .strict()
      .parse(req.body);
    let ticket;
    await mongoose.connection.transaction(async (session) => {
      ticket = await BarberTicket.findById(objectId(req.params.id)).session(
        session,
      );
      if (!ticket) fail(404, "Appointment not found.");
      const isCustomer =
        req.user.role === "customer" &&
        String(ticket.customerId) === req.user.id;
      if (isCustomer) {
        if (values.status !== "CANCELLED" || ticket.status !== "WAITING")
          fail(409, "Only a waiting appointment can be cancelled.");
        await Shop.updateOne(
          { _id: ticket.shopId },
          { $inc: { revision: 1 } },
          { session },
        );
      } else {
        const shop = await typedShop(
          req.user,
          ticket.shopId,
          "BARBER",
          session,
        );
        await Shop.updateOne(
          { _id: shop._id },
          { $inc: { revision: 1 } },
          { session },
        );
        if (values.status === "CANCELLED")
          fail(400, "Use reject with a reason for an absent customer.");
      }
      if (ticket.status === "WAITING" && ticket.expiresAt <= new Date())
        fail(409, "This appointment has expired.");
      if (values.status === "ONGOING") {
        if (ticket.status !== "WAITING")
          fail(409, "Only waiting appointments can be started.");
        if (
          await BarberTicket.exists({
            shopId: ticket.shopId,
            status: "ONGOING",
          }).session(session)
        )
          fail(409, "Complete the ongoing job first.");
        const first = await BarberTicket.findOne({
          shopId: ticket.shopId,
          status: "WAITING",
          expiresAt: future(),
        })
          .sort({ number: 1 })
          .session(session);
        if (!first || first.id !== ticket.id)
          fail(
            409,
            "Start the first waiting customer before this appointment.",
          );
        ticket.startedAt = new Date();
      } else if (values.status === "COMPLETED") {
        if (ticket.status !== "ONGOING")
          fail(409, "Only an ongoing job can be completed.");
        ticket.completedAt = new Date();
      } else if (values.status === "REJECTED") {
        if (ticket.status !== "WAITING" || !values.reason)
          fail(
            409,
            "Only waiting appointments can be rejected, with a reason.",
          );
      } else if (ticket.status !== "WAITING")
        fail(409, "This appointment is no longer waiting.");
      ticket.status = values.status;
      ticket.reason = values.reason;
      await ticket.save({ session });
      const shop = await Shop.findById(ticket.shopId).session(session);
      await notification(ticket.customerId, shop.name, ticket.status, session);
    });
    await broadcast(req, ticket.shopId, ticket.customerId);
    res.json({ ticket });
  });
  return router;
}
