import mongoose from "mongoose";
import { Order, Product } from "../models/marketplace.js";
export async function shopAnalytics(shopId) {
  const match = { shopId: new mongoose.Types.ObjectId(shopId) };
  const today = new Date();
  const indiaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(today);
  const start = new Date(`${indiaDate}T00:00:00+05:30`);
  const [
    todaysOrders,
    pendingOrders,
    completedOrders,
    totalOrders,
    products,
    lowStock,
    sales,
    trend,
    popular,
  ] = await Promise.all([
    Order.countDocuments({
      ...match,
      createdAt: mongoose.trusted({ $gte: start }),
    }),
    Order.countDocuments({ ...match, orderStatus: "PENDING" }),
    Order.countDocuments({ ...match, orderStatus: "COMPLETED" }),
    Order.countDocuments(match),
    Product.countDocuments({ ...match, active: true }),
    Product.countDocuments({
      ...match,
      active: true,
      inventoryTrackingEnabled: true,
      stockQuantity: mongoose.trusted({ $lte: 5 }),
    }),
    Order.aggregate([
      {
        $match: {
          ...match,
          orderStatus: "COMPLETED",
          updatedAt: { $gte: start },
        },
      },
      { $group: { _id: null, total: { $sum: "$subtotal" } } },
    ]),
    Order.aggregate([
      { $match: { ...match, orderStatus: "COMPLETED" } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$updatedAt",
              timezone: "Asia/Kolkata",
            },
          },
          sales: { $sum: "$subtotal" },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 14 },
    ]),
    Order.aggregate([
      { $match: { ...match, orderStatus: "COMPLETED" } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          name: { $last: "$items.name" },
          quantity: { $sum: "$items.quantity" },
        },
      },
      { $sort: { quantity: -1 } },
      { $limit: 5 },
    ]),
  ]);
  return {
    todaysOrders,
    pendingOrders,
    completedOrders,
    totalOrders,
    products,
    lowStock,
    todaysSales: sales[0]?.total || 0,
    completionRate: totalOrders
      ? Math.round((completedOrders / totalOrders) * 100)
      : 0,
    trend: trend.reverse(),
    popular,
  };
}
