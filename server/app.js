import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { authRoutes } from "./routes/auth.js";
import { authenticate, requireRole } from "./middleware/auth.js";
import { shopsRoutes } from "./routes/shops.js";
import { ordersRoutes } from "./routes/orders.js";
import { adminRoutes, analyticsRoutes } from "./routes/admin.js";
import { accountRoutes } from "./routes/account.js";
import { bookingRoutes } from "./routes/bookings.js";
import { imageRoutes } from "./routes/images.js";
import { createStorage } from "./services/storage/index.js";
import { PlatformSettings } from "./models/marketplace.js";
export function createApp(env, { storage = createStorage(env) } = {}) {
  const app = express();
  app.disable("x-powered-by");
  if (env.TRUST_PROXY_HOPS) app.set("trust proxy", env.TRUST_PROXY_HOPS);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          imgSrc: ["'self'", "https://res.cloudinary.com", "data:"],
          connectSrc: ["'self'", "wss:"],
          upgradeInsecureRequests: env.NODE_ENV === "production" ? [] : null,
        },
      },
    }),
  );
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 600,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  // Cookie mutations must come from the configured frontend; JSON-only requests
  // without Origin remain available to local scripts and API clients.
  app.use((req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.get("origin") && req.get("origin") !== env.CLIENT_URL)
        return res.status(403).json({ message: "Untrusted request origin." });
      if (req.get("sec-fetch-site") === "cross-site")
        return res.status(403).json({
          message:
            "Cross-site requests are not supported. Use a same-site API domain.",
        });
      const multipartImage =
        /^\/api\/images\/[^/]+\/[^/]+$/.test(req.path) &&
        req.method === "POST" &&
        req.is("multipart/form-data");
      if (
        req.headers["content-length"] &&
        req.headers["content-length"] !== "0" &&
        !req.is("application/json") &&
        !multipartImage
      )
        return res.status(415).json({ message: "Use application/json." });
    }
    next();
  });
  app.get("/api/health", (req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({
      status: ready ? "ok" : "unavailable",
      database: ready ? "connected" : "disconnected",
    });
  });
  app.use("/api/auth", authRoutes(env));
  app.get("/api/settings", async (req, res) => {
    const settings = await PlatformSettings.findOne({ key: "platform" });
    res.json({
      supportEmail: settings?.supportEmail || "",
      notice: settings?.notice || "",
    });
  });
  app.use("/api/images", imageRoutes(env, storage));
  app.use(
    "/api",
    shopsRoutes(env),
    ordersRoutes(env),
    analyticsRoutes(env),
    accountRoutes(env),
    bookingRoutes(env),
  );
  app.use("/api/admin", adminRoutes(env));
  app.get(
    "/api/admin/access",
    authenticate(env.JWT_SECRET),
    requireRole("admin"),
    (req, res) => res.json({ authorized: true }),
  );
  app.get(
    "/api/shopkeeper/access",
    authenticate(env.JWT_SECRET),
    requireRole("shopkeeper"),
    (req, res) => res.json({ authorized: true }),
  );
  app.use("/api", (req, res) =>
    res.status(404).json({ message: "Resource not found." }),
  );
  if (env.SERVE_CLIENT) {
    const directory = fileURLToPath(
      new URL("../client/dist/", import.meta.url),
    );
    app.use(
      express.static(directory, {
        index: false,
        maxAge: 0,
        setHeaders: (res, path) => {
          if (/[\\/]assets[\\/]/.test(path))
            res.setHeader(
              "Cache-Control",
              "public, max-age=31536000, immutable",
            );
        },
      }),
    );
    app.get("/{*path}", (req, res) => {
      res.set("Cache-Control", "no-cache");
      res.sendFile("index.html", { root: directory });
    });
  }
  app.use((req, res) =>
    res.status(404).json({ message: "Resource not found." }),
  );
  app.use((error, req, res, next) => {
    if (
      error.status &&
      error.status >= 400 &&
      error.status < 500 &&
      !error.type
    )
      return res.status(error.status).json({ message: error.message });
    if (error.status === 503)
      return res.status(503).json({ message: error.message });
    if (error.name === "MulterError")
      return res.status(400).json({
        message:
          "Upload one image, maximum 5 MB. No additional fields are allowed.",
      });
    if (error.name === "CastError" || error.name === "ValidationError")
      return res.status(400).json({ message: "Invalid record data." });
    if (error.name === "ZodError")
      return res.status(400).json({
        message: "Please check your details.",
        errors: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    if (error.code === 11000)
      return res
        .status(409)
        .json({ message: "An account with these details already exists." });
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ message: "Invalid JSON." });
    if (error.type === "entity.too.large")
      return res.status(413).json({ message: "Request is too large." });
    console.error("Request failed:", error.name);
    res
      .status(500)
      .json({ message: "Something went wrong. Please try again." });
  });
  return app;
}
