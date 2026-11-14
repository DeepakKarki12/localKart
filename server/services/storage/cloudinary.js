import { v2 as cloudinary } from "cloudinary";
import { fail } from "../../utils/http.js";
export function cloudinaryStorage(env) {
  const configured = !!(
    env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET
  );
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return {
    provider: "cloudinary",
    configured,
    async upload(buffer, publicId) {
      if (!configured)
        fail(
          503,
          "Image storage is not configured. Ask the administrator to set Cloudinary credentials.",
        );
      const asset = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            public_id: publicId,
            resource_type: "image",
            format: "webp",
            overwrite: false,
            timeout: 30000,
          },
          (error, result) => (error ? reject(error) : resolve(result)),
        );
        stream.end(buffer);
      });
      const url = (width, height, crop) =>
        cloudinary.url(asset.public_id, {
          secure: true,
          version: asset.version,
          transformation: [
            { width, height, crop, background: "white" },
            { quality: "auto:eco", fetch_format: "auto" },
          ],
        });
      return {
        provider: "cloudinary",
        publicId: asset.public_id,
        url: asset.secure_url,
        thumbnailUrl: url(320, 320, "pad"),
        detailUrl: url(960, 960, "pad"),
      };
    },
    async remove(publicId) {
      if (!configured) fail(503, "Image storage is not configured.");
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: "image",
        invalidate: true,
      });
      if (!["ok", "not found"].includes(result.result))
        throw new Error("Cloudinary deletion failed");
    },
  };
}
