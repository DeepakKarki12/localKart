import { T } from "../i18n/LanguageContext";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../services/api";
import { useCommerce } from "../context/CommerceContext";
import { Image } from "./MarketUI";
import { Button, Notice } from "./UI";
async function compress(file) {
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Use an image smaller than 5 MB.");
  if (
    !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)
  )
    throw new Error("Use JPEG, PNG, WebP or AVIF.");
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not process image.")),
      "image/webp",
      0.78,
    ),
  );
}
export function ImageUpload({ type, id, image }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cache = useQueryClient();
  const { notify } = useCommerce();
  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const blob = await compress(file);
      const data = new FormData();
      data.append("image", blob, "photo.webp");
      await api.post(`/images/${type}/${id}`, data, { timeout: 60000 });
      await cache.invalidateQueries();
      notify("Image saved.");
    } catch (err) {
      setError(err.response ? errorMessage(err) : err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="image-upload">
      <Image image={image} alt="Current photo" />
      <div>
        <label className="upload-label">
          {busy
            ? "Optimizing and uploading…"
            : image
              ? "Replace photo"
              : "Upload photo"}
          <input
            disabled={busy}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            onChange={(event) => {
              upload(event.target.files[0]);
              event.target.value = "";
            }}
          />
        </label>
        <p className="form-hint">
          <T>{"One image · up to 5 MB · compressed before upload"}</T>
        </p>
        {image && (
          <Button
            busy={busy}
            className="secondary"
            onClick={async () => {
              setBusy(true);
              try {
                await api.delete(`/images/${type}/${id}`);
                await cache.invalidateQueries();
                notify(
                  "Custom photo removed. Shared image will be used when available.",
                );
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <T>{"Remove photo"}</T>
          </Button>
        )}
        <Notice>{error}</Notice>
      </div>
    </div>
  );
}
