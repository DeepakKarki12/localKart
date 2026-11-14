import { z } from "zod";
const text = z.string().trim().min(1).max(300);
export const id = z.string().regex(/^[a-f\d]{24}$/i);
export const paise = z.number().int().min(0).max(100000000);
export const phone = z.string().regex(/^[6-9]\d{9}$/);
export const pin = z.string().regex(/^[1-9]\d{5}$/);
export const addressSchema = z
  .object({
    label: z.string().max(50).default("Home"),
    line: text,
    city: text,
    pinCode: pin,
  })
  .strict();
export const applicationSchema = z
  .object({
    name: text,
    category: text,
    businessType: z.enum(["RETAIL", "CLASSES", "BARBER"]).optional(),
    description: z.string().trim().max(2000),
    address: text,
    city: text,
    neighborhood: text,
    pinCode: pin,
    phone,
    businessDetails: z.string().max(1000).optional(),
  })
  .strict();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const shopSettingsSchema = applicationSchema
  .omit({ businessDetails: true })
  .partial()
  .extend({
    pickupEnabled: z.boolean().optional(),
    barberQueueOpen: z.boolean().optional(),
    temporarilyClosed: z.boolean().optional(),
    preparationMinutes: z.number().int().min(5).max(1440).optional(),
    coordinates: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .strict()
      .optional(),
    openingHours: z
      .array(
        z
          .object({
            day: z.number().int().min(0).max(6),
            open: time,
            close: time,
            closed: z.boolean(),
          })
          .strict(),
      )
      .length(7)
      .refine(
        (hours) => new Set(hours.map((h) => h.day)).size === 7,
        "Each day must appear once.",
      )
      .optional(),
  })
  .strict();
export const categorySchema = z
  .object({
    name: text,
    displayOrder: z.number().int().min(0).max(10000).default(0),
    active: z.boolean().default(true),
  })
  .strict();
export const productSchema = z
  .object({
    name: text,
    description: z.string().max(2000).default(""),
    categoryId: id,
    catalogId: id.nullable().optional(),
    price: paise,
    mrp: paise.nullable().optional(),
    unit: text,
    stockQuantity: z.number().int().min(0).max(1000000).default(0),
    inventoryTrackingEnabled: z.boolean().default(false),
    availabilityStatus: z
      .enum(["AVAILABLE", "CONFIRM_AVAILABILITY", "OUT_OF_STOCK"])
      .default("AVAILABLE"),
    active: z.boolean().default(true),
  })
  .strict()
  .refine((value) => value.mrp == null || value.mrp >= value.price, {
    path: ["mrp"],
    message: "MRP cannot be lower than selling price.",
  });
export const deliverySchema = z
  .object({
    deliveryEnabled: z.boolean(),
    deliveryRadiusKm: z.number().min(0.1).max(100),
    deliveryFee: paise,
    minimumOrderAmount: paise,
    deliveryTimeSlots: z.array(z.string().trim().min(3).max(100)).max(20),
    serviceablePinCodes: z.array(pin).max(100),
  })
  .strict()
  .refine(
    (value) =>
      !value.deliveryEnabled ||
      (value.serviceablePinCodes.length > 0 &&
        value.deliveryTimeSlots.length > 0),
    "Enabled delivery requires PIN codes and delivery windows.",
  );
export const orderSchema = z
  .object({
    expectedTotalAmount: paise.optional(),
    shopId: id,
    items: z
      .array(
        z
          .object({ productId: id, quantity: z.number().int().min(1).max(100) })
          .strict(),
      )
      .min(1)
      .max(100),
    customerName: text,
    phone,
    fulfillmentMethod: z.enum(["pickup", "delivery"]),
    deliveryAddress: addressSchema.optional(),
    deliveryWindow: z.string().max(100).optional(),
    paymentMethod: z.enum(["PAY_AT_STORE", "CASH_ON_DELIVERY"]),
    notes: z.string().max(1000).default(""),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.items.map((item) => item.productId)).size ===
      value.items.length,
    "Duplicate products are not allowed.",
  );
export const profileSchema = z
  .object({ name: text, phone, addresses: z.array(addressSchema).max(10) })
  .strict();
