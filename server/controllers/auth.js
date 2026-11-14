import crypto from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { User, publicUser } from "../models/User.js";
import { Session } from "../models/Session.js";
import { registerSchema, loginSchema } from "../validators/auth.js";
import { recordLoginFailure } from "../services/security-events.js";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const lifetime = 7 * 24 * 60 * 60 * 1000;
export function authController(env) {
  const cookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
  };
  const accessToken = (user) =>
    jwt.sign({}, env.JWT_SECRET, {
      subject: user.id,
      expiresIn: "15m",
      algorithm: "HS256",
      issuer: "localcart",
      audience: "localcart-client",
    });
  async function issue(user, res) {
    const token = crypto.randomBytes(48).toString("hex");
    await Session.create({
      userId: user.id,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + lifetime),
    });
    res.cookie("lc_refresh", token, { ...cookieOptions, maxAge: lifetime });
    return { user: publicUser(user), accessToken: accessToken(user) };
  }
  return {
    register: async (req, res) => {
      const data = registerSchema.parse(req.body);
      const passwordHash = await bcrypt.hash(data.password, 12);
      const user = await User.create({
        name: data.name,
        email: data.email,
        phone: data.phone,
        passwordHash,
        role: "customer",
      });
      res.status(201).json(await issue(user, res));
    },
    login: async (req, res) => {
      const data = loginSchema.parse(req.body);
      const user = await User.findOne({ email: data.email }).select(
        "+passwordHash",
      );
      // Always perform bcrypt work to reduce account enumeration via timing.
      const fallback =
        "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";
      const valid = await bcrypt.compare(
        data.password,
        user?.passwordHash || fallback,
      );
      if (!user || !valid || user.accountStatus !== "active") {
        await recordLoginFailure(req, data.email, env.JWT_SECRET, user?._id);
        return res.status(401).json({ message: "Invalid email or password." });
      }
      res.json(await issue(user, res));
    },
    refresh: async (req, res) => {
      const token = req.cookies.lc_refresh;
      if (typeof token !== "string" || token.length !== 96)
        return res.status(401).json({ message: "Please sign in." });
      // Atomic consumption prevents simultaneous use of the same refresh token.
      const session = await Session.findOneAndDelete({
        tokenHash: hash(token),
        expiresAt: mongoose.trusted({ $gt: new Date() }),
      });
      if (!session)
        return res.status(401).json({ message: "Please sign in again." });
      const user = await User.findById(session.userId);
      if (!user || user.accountStatus !== "active")
        return res.status(401).json({ message: "Account unavailable." });
      res.json(await issue(user, res));
    },
    logout: async (req, res) => {
      if (typeof req.cookies.lc_refresh === "string")
        await Session.deleteOne({ tokenHash: hash(req.cookies.lc_refresh) });
      res.clearCookie("lc_refresh", cookieOptions);
      res.status(204).end();
    },
    me: (req, res) => res.json({ user: publicUser(req.user) }),
  };
}
