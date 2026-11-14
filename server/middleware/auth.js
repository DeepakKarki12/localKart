import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
export function authenticate(secret) {
  return async (req, res, next) => {
    try {
      const header = req.get("authorization") || "";
      if (!header.startsWith("Bearer "))
        return res.status(401).json({ message: "Please sign in." });
      const claims = jwt.verify(header.slice(7), secret, {
        algorithms: ["HS256"],
        issuer: "localcart",
        audience: "localcart-client",
      });
      const user = await User.findById(claims.sub);
      if (!user || user.accountStatus !== "active")
        return res
          .status(401)
          .json({ message: "Session unavailable. Please sign in." });
      req.user = user;
      next();
    } catch (error) {
      if (
        error.name === "JsonWebTokenError" ||
        error.name === "TokenExpiredError" ||
        error.name === "CastError"
      )
        return res
          .status(401)
          .json({ message: "Session expired. Please sign in." });
      next(error);
    }
  };
}
export const requireRole =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.role)
      ? next()
      : res
          .status(403)
          .json({ message: "You do not have access to this resource." });
