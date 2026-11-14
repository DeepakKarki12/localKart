import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  replaceImage,
  detachImage,
  MAX_IMAGE_BYTES,
  imageTarget,
} from "../services/images.js";
export function imageRoutes(env, storage) {
  const router = Router();
  let activeUploads = 0;
  const capacity = (req, res, next) => {
    if (activeUploads >= 2)
      return res
        .status(429)
        .json({ message: "Image processing is busy. Try again shortly." });
    activeUploads++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        activeUploads--;
      }
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  };
  router.use(authenticate(env.JWT_SECRET), requireRole("shopkeeper", "admin"));
  const limit = rateLimit({
    windowMs: 60 * 60000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 1 },
    fileFilter: (req, file, done) => {
      const valid = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/avif",
      ].includes(file.mimetype);
      if (valid) done(null, true);
      else {
        const error = new Error("Use JPEG, PNG, WebP or AVIF.");
        error.status = 400;
        done(error);
      }
    },
  }).single("image");
  router.post(
    "/:type/:id",
    limit,
    capacity,
    async (req, res, next) => {
      await imageTarget(req.user, req.params.type, req.params.id);
      next();
    },
    upload,
    async (req, res) => {
      const image = await replaceImage(
        req.user,
        req.params.type,
        req.params.id,
        req.file?.buffer,
        storage,
      );
      res.status(201).json({ image });
    },
  );
  router.delete("/:type/:id", limit, async (req, res) => {
    await detachImage(req.user, req.params.type, req.params.id);
    res.status(204).end();
  });
  return router;
}
