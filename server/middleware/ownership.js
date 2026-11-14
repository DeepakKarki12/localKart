import { Shop } from "../models/marketplace.js";
import { fail, objectId } from "../utils/http.js";
export async function ownShop(user, id, { approved = true, session } = {}) {
  const query = Shop.findById(objectId(id));
  if (session) query.session(session);
  const shop = await query;
  if (!shop) fail(404, "Store not found.");
  if (
    user.role !== "admin" &&
    (user.role !== "shopkeeper" || String(shop.ownerId) !== user.id)
  )
    fail(403, "This store belongs to another account.");
  if (
    approved &&
    user.role !== "admin" &&
    (shop.approvalStatus !== "APPROVED" || !shop.active)
  )
    fail(403, "Your store must be approved and active first.");
  return shop;
}
export async function publicShop(id) {
  const shop = await Shop.findOne({
    _id: objectId(id),
    approvalStatus: "APPROVED",
    active: true,
  });
  if (!shop) fail(404, "Store is not available.");
  return shop;
}
