# Image storage and operating costs

MongoDB stores image URL metadata, never image buffers or base64 data. Each custom product/store/catalog photo is one object with `provider`, `publicId`, `url`, `thumbnailUrl` and `detailUrl`. The MediaAsset collection tracks that same metadata for attachment/deletion recovery. HTTP upload bodies are held briefly in bounded Node memory; originals are not written to disk.

## Configure Cloudinary

Create a Cloudinary product environment and put its credentials in the root ignored `.env` or backend host environment:

```dotenv
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

Use the Cloudinary console to obtain these values. No unsigned upload preset is needed. The authenticated backend uses the Cloudinary SDK to sign uploads. API secrets are never returned to the client or assigned a `VITE_` variable. Keep Cloudinary upload presets signed and do not enable anonymous uploads for this application.

Run `npm run images:verify` after configuration. It uploads a generated test image, checks direct CDN delivery, and deletes the test asset in `finally`. This command makes actual provider calls and has not been run without credentials. Marketplace integration tests replace only the external provider adapter; image decoding, authorization, transactions, attachment and cleanup use actual code and MongoDB.

If credentials are absent, storefront placeholders work and upload requests return a helpful 503 response. No fake upload URL is generated.

## Upload and delivery

1. A shopkeeper or admin selects one JPEG, PNG, WebP or AVIF file, up to 5 MB.
2. The browser downsizes to a maximum 1200×1200 bounding box and encodes WebP at quality 78. This reduces upload bandwidth. Client checks are conveniences, not authorization.
3. The API authenticates the user, loads the target record and verifies ownership before parsing a file. Products require an approved active shop; pending owners can upload their application shop photo. Only admins can upload shared catalog photos.
4. Multer permits one file with no extra fields. Sharp decodes actual content, rejects unsupported/animated images and images above 20 megapixels, strips metadata and normalizes to WebP within 1200×1200. The MIME header alone is not trusted. Sharp uses one processing thread and a 16 MB cache; at most two upload requests are admitted per process.
5. The backend uploads the compressed buffer under a unique `localcart/<type>/<record-id>/<uuid>` public ID. It never overwrites another asset.
6. The database transaction attaches the new metadata and retires the old asset only after upload succeeds. A failed attachment retains the previous photo and queues the new asset for cleanup.
7. The browser requests images directly from Cloudinary's CDN: **320×320 thumbnails** and **960×960 details**, padded to a square with automatic quality and format selection. No image download route proxies CDN traffic through Express.

Delivery uses `f_auto`/`q_auto:eco`; the browser and Cloudinary configuration determine the negotiated format. AVIF is not guaranteed for every account/browser; WebP is the normalized upload format. Fixed sizes and versioned unique URLs reduce transformation variety and cache churn. See [Cloudinary optimization](https://cloudinary.com/documentation/image_optimization) and [Node upload documentation](https://cloudinary.com/documentation/node_image_and_video_upload).

Product images use `loading="lazy"`, `decoding="async"` and explicit dimensions. A local SVG appears when there is no photo or a CDN request fails. The production CSP permits the Cloudinary CDN.

## Shared branded product photos

Admins create entries in `/admin/catalog`, optionally including an 8–14 digit barcode, then edit the entry to upload an authorized photo. Shopkeepers search that catalog by name or barcode and prefill their own listing. Prices, availability, categories and stock remain shop-specific.

A Product stores a `catalogId` reference, not a duplicate shared image. The rendering rule is `product.image || product.catalogId.image || placeholder`. A shopkeeper can upload one custom override. Removing the override reveals the current shared photo and never deletes the catalog asset. Only upload photographs or artwork the business has permission to distribute; this project does not ship unlicensed branded imagery.

## Replacement, deletion and recovery

`POST /api/images/:type/:id` replaces a target photo; `DELETE` removes its custom photo. Types are `product`, `shop`, and `catalog`. Clients cannot submit an arbitrary Cloudinary public ID or URL to delete. Target ownership and current shop approval are checked again inside the attachment transaction.

Retired assets are processed in batches of 20 every 15 minutes while the API is running. `npm run images:cleanup` runs a manual batch. Each asset is checked against product, shop and catalog references before provider deletion. Provider failures are retried, and completed deletions remove their queue records. Stale uploading records are reclaimed after 24 hours. Attachment and reclamation compete atomically so an expired upload cannot later attach a deleted asset. Provider deletion is idempotent and requests CDN invalidation; cached copies may persist briefly while invalidation propagates. See [Cloudinary invalidation](https://cloudinary.com/documentation/invalidate_cached_media_assets_on_the_cdn).

Archiving a product retains its photo so the listing can be reactivated. Remove its custom photo first when storage should be reclaimed. Shared images remain while the catalog entry is in use. On a sleeping host, cleanup resumes when the process runs; inspect MediaAsset `state`, `attempts` and safe `lastError` metadata if deletion is delayed.

## Later R2 migration

`server/services/storage/index.js` is the provider factory. Product CRUD and image UI do not import Cloudinary. Implement an R2 adapter with the same methods:

```js
{
  provider: 'r2',
  configured: true,
  async upload(webpBuffer, uniqueKey) {
    return { provider: 'r2', publicId: uniqueKey, url, thumbnailUrl, detailUrl };
  },
  async remove(publicId) { /* idempotent object deletion */ }
}
```

For R2, generate the two fixed WebP sizes during upload and publish them behind a CDN/custom domain. Change the factory and production CSP to allow that domain. No product-management rewrite is needed. Existing Cloudinary metadata continues to render during migration. Keep the old adapter available for cleanup until old assets have been migrated; the current cleanup intentionally skips records belonging to a different provider. Do not point a new provider's deletion method at old Cloudinary keys.

## Keep the bill small

- Start with one optional photo per product and reuse common catalog entries.
- Use the provided fixed transforms; do not generate arbitrary dimensions from viewport widths.
- Keep originals bounded and disable unnecessary eager transformations.
- Reclaim retired assets; review Cloudinary storage, transformations and bandwidth in its console.
- The app has no permanent worker, Redis instance or image disk. Provider quotas and free-tier limits still apply; monitor real usage rather than assuming unlimited free storage.
