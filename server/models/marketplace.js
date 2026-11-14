import mongoose from "mongoose";
const { Schema } = mongoose;
const ref = (model, extra = {}) => ({
  type: Schema.Types.ObjectId,
  ref: model,
  ...extra,
});
const money = {
  type: Number,
  min: 0,
  validate: Number.isSafeInteger,
  default: 0,
};
const image = new Schema(
  {
    provider: String,
    publicId: String,
    url: String,
    thumbnailUrl: String,
    detailUrl: String,
  },
  { _id: false },
);
const address = new Schema(
  { label: String, line: String, city: String, pinCode: String },
  { _id: true },
);
export const Shop = mongoose.model(
  "Shop",
  new Schema(
    {
      ownerId: ref("User", { required: true, unique: true }),
      revision: { type: Number, default: 0 },
      name: { type: String, required: true },
      slug: { type: String, unique: true, required: true },
      category: String,
      businessType: {
        type: String,
        enum: ["RETAIL", "CLASSES", "BARBER"],
        default: "RETAIL",
      },
      barberQueueOpen: { type: Boolean, default: true },
      barberSequence: { type: Number, default: 0 },
      description: String,
      address: String,
      city: String,
      neighborhood: String,
      pinCode: String,
      phone: String,
      businessDetails: String,
      coordinates: { lat: Number, lng: Number },
      image,
      approvalStatus: {
        type: String,
        enum: ["PENDING_APPROVAL", "APPROVED", "REJECTED", "SUSPENDED"],
        default: "PENDING_APPROVAL",
      },
      active: { type: Boolean, default: false },
      verificationNotes: { type: String, select: false },
      rejectionReason: String,
      openingHours: [
        {
          _id: false,
          day: Number,
          open: String,
          close: String,
          closed: Boolean,
        },
      ],
      temporarilyClosed: { type: Boolean, default: false },
      pickupEnabled: { type: Boolean, default: true },
      preparationMinutes: { type: Number, default: 30 },
      deliveryEnabled: { type: Boolean, default: false },
      deliverySettings: {
        deliveryRadiusKm: { type: Number, default: 5 },
        deliveryFee: money,
        minimumOrderAmount: money,
        deliveryTimeSlots: [String],
        serviceablePinCodes: [String],
      },
    },
    { timestamps: true },
  ).index({ approvalStatus: 1, active: 1, city: 1, pinCode: 1 }),
);
export const Category = mongoose.model(
  "Category",
  new Schema(
    {
      shopId: ref("Shop", { required: true, index: true }),
      name: String,
      slug: String,
      displayOrder: { type: Number, default: 0 },
      active: { type: Boolean, default: true },
    },
    { timestamps: true },
  ).index({ shopId: 1, slug: 1 }, { unique: true }),
);
export const CatalogProduct = mongoose.model(
  "CatalogProduct",
  new Schema(
    {
      name: String,
      barcode: { type: String, unique: true, sparse: true },
      unit: String,
      description: String,
      image,
    },
    { timestamps: true },
  ),
);
export const Product = mongoose.model(
  "Product",
  new Schema(
    {
      shopId: ref("Shop", { required: true, index: true }),
      categoryId: ref("Category", { required: true }),
      revision: { type: Number, default: 0 },
      catalogId: ref("CatalogProduct"),
      name: { type: String, required: true },
      description: String,
      image,
      price: money,
      mrp: {
        type: Number,
        min: 0,
        validate: (value) => value == null || Number.isSafeInteger(value),
      },
      unit: String,
      stockQuantity: {
        type: Number,
        min: 0,
        validate: Number.isSafeInteger,
        default: 0,
      },
      availabilityStatus: {
        type: String,
        enum: ["AVAILABLE", "CONFIRM_AVAILABILITY", "OUT_OF_STOCK"],
        default: "AVAILABLE",
      },
      inventoryTrackingEnabled: { type: Boolean, default: false },
      active: { type: Boolean, default: true },
    },
    { timestamps: true },
  ).index({ shopId: 1, active: 1, categoryId: 1 }),
);
export const Order = mongoose.model(
  "Order",
  new Schema(
    {
      orderNumber: { type: String, unique: true, required: true },
      customerId: ref("User", { required: true, index: true }),
      shopId: ref("Shop", { required: true, index: true }),
      items: [
        {
          _id: false,
          productId: ref("Product"),
          name: String,
          unit: String,
          price: money,
          quantity: Number,
          inventoryTracked: Boolean,
        },
      ],
      subtotal: money,
      deliveryFee: money,
      totalAmount: money,
      platformFee: money,
      customerName: String,
      phone: String,
      notes: String,
      fulfillmentMethod: { type: String, enum: ["pickup", "delivery"] },
      deliveryAddress: address,
      deliveryWindow: String,
      paymentMethod: {
        type: String,
        enum: ["PAY_AT_STORE", "CASH_ON_DELIVERY"],
      },
      paymentStatus: {
        type: String,
        enum: ["UNPAID", "PAID"],
        default: "UNPAID",
      },
      orderStatus: {
        type: String,
        enum: [
          "PENDING",
          "ACCEPTED",
          "PREPARING",
          "READY_FOR_PICKUP",
          "OUT_FOR_DELIVERY",
          "COMPLETED",
          "REJECTED",
          "CANCELLED",
        ],
        default: "PENDING",
      },
      pickupCodeHash: { type: String, select: false },
      pickupCodeEncrypted: { type: String, select: false },
      pickupVerifiedAt: Date,
      rejectionReason: String,
      cancellationReason: String,
      idempotencyKey: { type: String, required: true },
      statusHistory: [
        {
          _id: false,
          status: String,
          actorId: ref("User"),
          reason: String,
          at: Date,
        },
      ],
    },
    { timestamps: true },
  )
    .index({ customerId: 1, idempotencyKey: 1 }, { unique: true })
    .index({ shopId: 1, orderStatus: 1, createdAt: -1 }),
);
export const Notification = mongoose.model(
  "Notification",
  new Schema(
    {
      recipientId: ref("User", { required: true }),
      orderId: ref("Order"),
      productId: ref("Product"),
      shopSlug: String,
      productName: String,
      shopName: String,
      orderNumber: String,
      orderStatus: String,
      bookingTitle: String,
      bookingStatus: String,
      type: String,
      message: String,
      read: { type: Boolean, default: false },
    },
    { timestamps: true },
  ).index({ recipientId: 1, createdAt: -1 }),
);
export const Subscription = mongoose.model(
  "Subscription",
  new Schema(
    {
      shopId: ref("Shop", { unique: true }),
      plan: String,
      amount: money,
      status: { type: String, enum: ["ACTIVE", "EXPIRED", "CANCELLED"] },
      startDate: Date,
      endDate: Date,
    },
    { timestamps: true },
  ),
);
export const AuditLog = mongoose.model(
  "AuditLog",
  new Schema(
    {
      actorId: ref("User"),
      action: String,
      targetType: String,
      targetId: Schema.Types.ObjectId,
      metadata: Schema.Types.Mixed,
    },
    { timestamps: { createdAt: true, updatedAt: false } },
  ).index({ createdAt: -1 }),
);
export const SecurityEvent = mongoose.model(
  "SecurityEvent",
  new Schema({
    type: String,
    emailFingerprint: String,
    ipFingerprint: String,
    userId: ref("User"),
    createdAt: {
      type: Date,
      default: Date.now,
      index: { expires: 30 * 86400 },
    },
  }).index({ createdAt: -1 }),
);
export const PlatformSettings = mongoose.model(
  "PlatformSettings",
  new Schema({
    key: { type: String, unique: true, default: "platform" },
    supportEmail: { type: String, default: "support@example.com" },
    platformFeeBps: { type: Number, default: 0 },
    notice: String,
  }),
);
export const ProductRequest = mongoose.model(
  "ProductRequest",
  new Schema(
    {
      customerId: ref("User"),
      shopId: ref("Shop"),
      message: String,
      resolved: { type: Boolean, default: false },
      availableProductId: ref("Product"),
    },
    { timestamps: true },
  ),
);
// A durable deletion queue contains metadata only; binaries never enter MongoDB.
export const MediaAsset = mongoose.model(
  "MediaAsset",
  new Schema(
    {
      ...image.obj,
      ownerId: ref("User"),
      targetType: String,
      targetId: Schema.Types.ObjectId,
      state: {
        type: String,
        enum: ["uploading", "attached", "retired"],
        default: "uploading",
      },
      attempts: { type: Number, default: 0 },
      lastError: String,
    },
    { timestamps: true },
  ).index({ state: 1, updatedAt: 1 }),
);
export { address };
