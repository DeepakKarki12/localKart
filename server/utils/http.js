import mongoose from "mongoose";
export function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
export const objectId = (value) => {
  if (!mongoose.isValidObjectId(value)) fail(400, "Invalid record ID.");
  return value;
};
export function pagination(query) {
  const page = Math.max(
    1,
    Math.min(Math.trunc(Number(query.page)) || 1, 10000),
  );
  const limit = Math.max(
    1,
    Math.min(Math.trunc(Number(query.limit)) || 20, 100),
  );
  return { page, limit, skip: (page - 1) * limit };
}
export const slugify = (value) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "store";
export const escaped = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export async function paged(Model, filter, query, options = {}) {
  const { page, limit, skip } = pagination(query);
  const [items, total] = await Promise.all([
    Model.find(filter)
      .sort(options.sort || { createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(options.select || "")
      .populate(options.populate || []),
    Model.countDocuments(filter),
  ]);
  return { items, total, page, pages: Math.ceil(total / limit) };
}
