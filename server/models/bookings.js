import mongoose from "mongoose";
const { Schema } = mongoose;
const ref = (model) => ({
  type: Schema.Types.ObjectId,
  ref: model,
  required: true,
});

export const ClassSession = mongoose.model(
  "ClassSession",
  new Schema(
    {
      shopId: ref("Shop"),
      title: { type: String, required: true },
      discipline: {
        type: String,
        enum: ["TEACHING", "GYM", "YOGA"],
        required: true,
      },
      description: String,
      startsAt: { type: Date, required: true },
      endsAt: { type: Date, required: true },
      capacity: { type: Number, min: 1, required: true },
      reservedSeats: { type: Number, default: 0, min: 0 },
      joinUrl: { type: String, required: true, select: false },
      cancelled: { type: Boolean, default: false },
    },
    { timestamps: true },
  ).index({ shopId: 1, startsAt: 1 }),
);

export const ClassBooking = mongoose.model(
  "ClassBooking",
  new Schema(
    {
      sessionId: ref("ClassSession"),
      shopId: ref("Shop"),
      customerId: ref("User"),
      customerName: String,
      status: {
        type: String,
        enum: ["CONFIRMED", "CANCELLED"],
        default: "CONFIRMED",
      },
    },
    { timestamps: true },
  )
    .index({ sessionId: 1, customerId: 1 }, { unique: true })
    .index({ customerId: 1, createdAt: -1 }),
);

export const BarberTicket = mongoose.model(
  "BarberTicket",
  new Schema(
    {
      shopId: ref("Shop"),
      customerId: ref("User"),
      customerName: String,
      number: { type: Number, required: true },
      expiresAt: { type: Date, required: true },
      status: {
        type: String,
        enum: [
          "WAITING",
          "ONGOING",
          "COMPLETED",
          "REJECTED",
          "CANCELLED",
          "EXPIRED",
        ],
        default: "WAITING",
      },
      reason: String,
      startedAt: Date,
      completedAt: Date,
    },
    { timestamps: true },
  )
    .index({ shopId: 1, number: 1 }, { unique: true })
    .index({ shopId: 1, status: 1, number: 1, expiresAt: 1 })
    .index(
      { shopId: 1, customerId: 1 },
      { unique: true, partialFilterExpression: { status: "WAITING" } },
    )
    .index(
      { shopId: 1 },
      { unique: true, partialFilterExpression: { status: "ONGOING" } },
    )
    .index({ customerId: 1, createdAt: -1 }),
);
