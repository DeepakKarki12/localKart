export const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format((value || 0) / 100);
export const dateTime = (value) =>
  new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
export const label = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .toLowerCase();
export const rupeesToPaise = (value) => Math.round(Number(value) * 100);
export { openingState as shopOpen } from "../../../shared/opening-hours.js";
export function distanceKm(location, coordinates) {
  if (!location || coordinates?.lat == null || coordinates?.lng == null)
    return null;
  const radians = (n) => (n * Math.PI) / 180;
  const dLat = radians(coordinates.lat - location.lat),
    dLon = radians(coordinates.lng - location.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(location.lat)) *
      Math.cos(radians(coordinates.lat)) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
