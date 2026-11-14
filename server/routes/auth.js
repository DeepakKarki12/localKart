import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authController } from "../controllers/auth.js";
import { authenticate } from "../middleware/auth.js";
export function authRoutes(env) {
  const router = Router();
  const controller = authController(env);
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  const credentialsLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      message: "Too many sign-in attempts. Please try again in 15 minutes.",
    },
  });
  const refreshLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      message: "Too many session requests. Please wait before trying again.",
    },
  });
  router.post("/register", credentialsLimit, controller.register);
  router.post("/login", credentialsLimit, controller.login);
  router.post("/refresh", refreshLimit, controller.refresh);
  router.post("/logout", controller.logout);
  router.get("/me", authenticate(env.JWT_SECRET), controller.me);
  return router;
}
