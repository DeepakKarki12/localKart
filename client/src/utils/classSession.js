import { z } from "zod";

export function indiaTimeToIso(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value))
    throw new Error("Choose a valid date and time.");
  const date = new Date(`${value}+05:30`);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Choose a valid date and time.");
  return date.toISOString();
}
const validTime = (value) => {
  try {
    return Number.isFinite(Date.parse(indiaTimeToIso(value)));
  } catch {
    return false;
  }
};
export const classSessionSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "Enter a session title with at least two characters.")
      .max(120),
    discipline: z.enum(["TEACHING", "GYM", "YOGA"]),
    description: z.string().max(1000),
    startsAt: z
      .string()
      .refine(validTime, "Choose a valid start date and time."),
    endsAt: z.string().refine(validTime, "Choose a valid end date and time."),
    capacity: z
      .number({ error: "Enter the number of seats." })
      .int("Seats must be a whole number.")
      .min(1, "At least one seat is required.")
      .max(1000, "A session can have at most 1000 seats."),
    joinUrl: z
      .string()
      .trim()
      .url("Enter a valid meeting link.")
      .refine((value) => {
        try {
          const url = new URL(value);
          return url.protocol === "https:" && !url.username && !url.password;
        } catch {
          return false;
        }
      }, "Use a secure HTTPS meeting link."),
  })
  .superRefine((values, context) => {
    if (
      validTime(values.startsAt) &&
      new Date(indiaTimeToIso(values.startsAt)) <= new Date()
    )
      context.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: "Choose a start time in the future (India time).",
      });
    if (
      validTime(values.startsAt) &&
      validTime(values.endsAt) &&
      new Date(indiaTimeToIso(values.endsAt)) <=
        new Date(indiaTimeToIso(values.startsAt))
    )
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "The end time must be after the start time.",
      });
  });
