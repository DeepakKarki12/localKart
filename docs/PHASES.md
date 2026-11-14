# Development phases and verification

The original Phase 1 handoff is retained in `PHASE-1.md` as history. The later instruction authorized completing all phases, so the remaining work proceeded without intermediate approval stops. All commands below run from the repository root.

## Phase 1 — foundation

React/Vite/Tailwind, React Router, Express/Mongoose, auth context, Axios, TanStack Query, shared fields/buttons, customer registration/login, protected roles, secure administrator script and environment configuration. Existing files were retained and expanded. Added address persistence to User and kept refresh-session rotation/hash-only storage.

Run: `npm run setup:local`, then `npm run db:local` in one terminal and `npm run dev` in another. Atlas users configure the URI and skip the database helper.

Verification: the original 11 authentication/database/security tests pass in the expanded suite. Browser tests register and sign in users against a real API, restore sessions and persist profiles.

## Phase 2 — shop applications and approval

Added marketplace schemas, `middleware/ownership.js`, `routes/shops.js`, `routes/admin.js`, shared request validators, transaction-backed application/role change, approval status page and admin shop review. Shop approval is never owner-controlled. Physical verification confirmation and internal notes are required for approval. Pending/rejected/suspended stores are excluded publicly. Account suspension also suspends an owner's store.

Run: use `/apply` as a customer account and `/admin/shops` as a locally bootstrapped admin.

Verification: integration tests check atomic shopkeeper registration, duplicate applications, hidden pending shops, self-approval denial, physical-verification enforcement, activation and audit records. The desktop browser journey completes this workflow through the forms.

## Phase 3 — storefront management and optimized images

Added Category/Product/CatalogProduct/MediaAsset schemas; category/product ownership checks, transactions, archival and bulk availability; shopkeeper product/category/settings pages; image upload component; `services/images.js`, provider adapter/factory and authenticated image routes. Shared catalog photos and per-shop overrides are implemented. No image binary/base64 field exists in any MongoDB schema.

Run: approved shopkeepers open `/shopkeeper/products`, `/categories` and `/settings`; admins manage shared entries at `/admin/catalog`. Configure Cloudinary and use `npm run images:verify` for a live provider check.

Verification: integration tests cover cross-shop writes/deletion/bulk operations, category safety, input validation, actual image decoding, byte and pixel limits, AVIF-to-WebP conversion, replacement, deletion retry, shared-image isolation, provider failures and attachment failure recovery. Browser tests create products and catalog entries. A missing-Cloudinary upload is checked for a real helpful error. Live Cloudinary calls remain unverified without credentials.

## Phase 4 — customer shopping

Added city/neighborhood/PIN picker, optional browser distances, approved-store/category discovery, cross-store product search, public storefronts and product-detail deep links, product modal, local cart, fixed-size lazy images and placeholders. CommerceContext provides cart state, single-shop switching protection and toasts. Shared India-time schedule logic lives in `shared/opening-hours.js`.

Run: `/shops`, `/search`, `/shop/:slug`, `/cart`.

Verification: database tests restrict public visibility/location results and product detail access. Desktop/mobile browser journeys browse real fixtures, add products, persist the cart and check responsive layouts. Overnight opening hours are tested explicitly. No fabricated shops or availability are served by application endpoints.

## Phase 5 — transactional orders and pickup

Added order/notification models, order service/routes, crypto helpers, persisted notifications, Socket.IO server/client integration and polling. Checkout obtains a server-priced quote, detects changed totals and uses idempotency keys for creation. Exact stock is reserved/released transactionally. Status transitions, customer cancellation, mandatory rejection reasons and pickup-code verification are enforced server-side.

Run: `/checkout`, `/orders`, `/orders/:id`, `/shopkeeper/orders`, `/notifications`.

Verification: tests cover server pricing, untrusted price rejection, snapshots after product edits, quote non-reservation, replay/idempotency, cross-account privacy, invalid transitions, acceptance/rejection/cancellation, code privacy and verification, exact restoration and simultaneous orders for the last unit. The browser journey completes pickup and checks that the customer's page receives status changes without reload.

## Phase 6 — delivery and administration

Added delivery configuration/eligibility/windows/minimums/fees, admin product/user/order management, platform settings, subscriptions, audit trails, dispute resolution records, failed-login security activity and analytics. Completed merchandise value, earned platform fees, delivery fees and configured subscriptions are separated. Extras include catalog barcode lookup, optional supported-browser camera scanning, WhatsApp/share links, QR generation, product requests and repeat available items.

Run: `/admin`, store review/delivery pages, `/shopkeeper`, customer delivery checkout.

Verification: integration tests enforce delivery permission/PIN/minimum/window rules, backend fee calculation, account suspension, manual plan records, sales exclusions and administrative authorization. Browser tests configure delivery, place and fulfill a cash-delivery order, configure catalog/support settings, handle product requests, and inspect dashboards at a 390px viewport. Camera hardware scanning and OS-level browser notification presentation are not verified.

## Phase 7 — local verification and deployment preparation

Added real MongoDB integration tests, Playwright desktop/mobile journeys, test-only fixture harness, PWA manifest/offline shell, production static-serving option, bounded resource settings, persistent local database setup, Cloudinary verification/cleanup commands, Render Blueprint/schema validator, CI workflow and operating documentation. All source is formatted for readability.

Commands: `npm test`, `npm run test:e2e`, `npm run build`, `npm run deploy:validate`.

Final verification on November 13, 2026:

| Check                              | Observed result                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend integration/security suite | **37 passed**, zero failures or skips; isolated real MongoDB processes and replica set                                                          |
| Chrome browser suite               | **4 passed**: desktop approval-to-pickup, mobile shopping/profile, delivery/catalog/manual subscription/mobile dashboards, PWA offline fallback |
| Production frontend build          | Passed; route/vendor chunks emitted to `client/dist`                                                                                            |
| Combined production serving        | SPA deep links, JSON API 404s and Cloudinary-permitting CSP tested                                                                              |
| Render Blueprint                   | Passed the current public JSON Schema; no hosting resources created                                                                             |
| Runtime dependency audit           | Zero known vulnerabilities reported by npm                                                                                                      |
| Persistent localhost startup       | React returned HTTP 200 and API health reported actual MongoDB connectivity on the workspace-owned local replica set                            |
| Frontend output scan               | No backend secret-variable names found in generated frontend files                                                                              |

Screenshots from isolated browser fixtures are available in `artifacts/customer-desktop.png`, `customer-mobile.png`, `shopkeeper-desktop.png`, `shopkeeper-mobile.png`, `admin-desktop.png` and `admin-mobile.png`. Mobile layouts were checked at 390×844 and screenshots inspected. The test accounts/stores are not seeded into the real development database.

The build emits harmless comment-annotation warnings from Zod dependencies. Browser teardown can emit WebSocket connection-reset messages while contexts close; the live status assertions and all tests passed.

Cloudinary uploads were tested at the external-provider boundary with an injected test adapter, not against a live Cloudinary account. Real CDN upload/delivery/deletion requires `npm run images:verify` after credentials are supplied. Atlas connectivity, a live hosting deployment, CI execution, backup/restore, production load testing, physical devices, camera hardware and OS notification delivery are not claimed as verified. Real shop visits and operator-specific policies remain launch work. The generated ignored `.env` and persistent local database directory are retained; development servers are stopped at handoff and can be restarted using the README commands.
