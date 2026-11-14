# Deployment

No hosted services were created by this implementation. `render.yaml` was structurally validated against Render's current JSON Schema. A live Render CLI/API validation and a real deployment remain environment-specific checks.

## Option A: one same-origin Node service

The root Blueprint builds the frontend and serves `client/dist` through Express with `SERVE_CLIENT=true`. It uses a Render free web service for preview, no extra worker or disk. It does not create MongoDB or Cloudinary resources. Render's free services have operational limitations and are not intended for production applications; use this configuration for initial evaluation and choose appropriate compute before a business launch. See [Render free services](https://render.com/docs/free).

1. Push the repository to your Git provider. Create a Render Blueprint from the repository and review the proposed service before applying.
2. Supply `MONGODB_URI` for an Atlas database, `CLIENT_URL` equal to the exact HTTPS site origin, and the three Cloudinary credentials. The Blueprint generates JWT and pickup-encryption secrets. If the generated Render URL is unknown initially, update CLIENT_URL to the returned origin before using authentication. A custom domain's exact origin can be configured in advance.
3. The build command is `npm ci --include=dev && npm run build`. `MONGOMS_DISABLE_POSTINSTALL=1` prevents test MongoDB downloads during deployment. The start command is `npm start -w server`. The API binds the host-provided `PORT`; health check is `/api/health`.
4. Configure Atlas network access for the service's outbound addresses and create a database-scoped read/write user. Use an Atlas replica set: standalone MongoDB is rejected at API startup because orders require transactions.
5. Create the first administrator with `npm run admin:create` from a trusted environment with the same MongoDB URI and the ADMIN variables. Remove ADMIN_PASSWORD afterward. There is no public privileged-signup endpoint.
6. Confirm homepage and deep links, sign-in/session restoration, a shop approval, a live image upload, pickup and delivery ordering, and notifications over HTTPS. Inspect the account's real Cloudinary quotas and host metrics.

The Blueprint defaults `autoDeployTrigger: off` so a source push does not silently release changes. `TRUST_PROXY_HOPS=1` assumes exactly one trusted host proxy. Confirm the actual deployment topology before changing it. A reverse-proxy hop count that is too broad lets untrusted forwarded addresses interfere with rate limiting.

Run `npm run deploy:validate` to fetch and validate against [Render's current schema](https://render.com/schema/render.yaml.json). If Render CLI is installed and authenticated, also run `render blueprints validate render.yaml` before applying. JSON Schema validation alone does not verify account-level availability or perform a deployment. The configuration follows the [Blueprint specification](https://render.com/docs/blueprint-spec) and [environment-variable reference](https://render.com/docs/configure-environment-variables).

## Option B: static CDN frontend plus Express backend

The same source supports a separately hosted frontend:

| Setting      | Frontend                                                      | Backend                                                               |
| ------------ | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| Build        | `npm ci --include=dev && npm run build`                       | `npm ci --omit=dev --workspace server --include-workspace-root=false` |
| Output/start | Publish `client/dist`                                         | `npm start -w server`                                                 |
| API URL      | Build with `VITE_API_URL=https://api.your-domain.example/api` | N/A                                                                   |
| Origin       | `https://shop.your-domain.example`                            | Set CLIENT_URL to that exact origin                                   |
| Server mode  | N/A                                                           | `NODE_ENV=production`, `SERVE_CLIENT=false`                           |

Use HTTPS subdomains of the same registrable domain, or reverse-proxy `/api` and `/socket.io` through the frontend origin. This app deliberately uses SameSite=Lax refresh cookies and rejects cross-site mutations. Unrelated default hosting domains will not provide reliable refresh sessions. Do not solve this by exposing refresh tokens in localStorage.

Configure static-host SPA fallback to `/index.html`. Keep API and WebSocket proxy routes ahead of the fallback if using a same-origin reverse proxy. Proxy WebSocket upgrades and use Socket.IO's `/socket.io` path. With separate same-site domains, Socket.IO connects to the origin of VITE_API_URL directly.

Static headers:

```text
/assets/*       Cache-Control: public, max-age=31536000, immutable
/index.html     Cache-Control: no-cache
/sw.js          Cache-Control: no-cache
/*              X-Content-Type-Options: nosniff
/*              Referrer-Policy: strict-origin-when-cross-origin
/*              X-Frame-Options: DENY
```

If adding CSP at the static host, permit scripts/styles from self, Cloudinary images from `https://res.cloudinary.com`, `data:` images for QR previews, and connect-src to the exact API HTTPS/WSS origin. Test the policy with actual image requests. Express already sets security headers for the combined deployment.

## Operations

- Keep `PICKUP_ENCRYPTION_SECRET` stable while pickup orders are outstanding. If it is absent, JWT_SECRET is the compatibility fallback. Rotating that fallback also makes existing encrypted pickup codes unreadable. Separate keys let JWT rotation leave pickup codes intact.
- Access tokens expire after 15 minutes. Logout revokes refresh access; a previously issued access token can remain valid until expiry. Suspended accounts are denied immediately because permissions are loaded from MongoDB for each request.
- Rate limits and Socket.IO rooms are process-local in this low-cost single-instance setup. Before scaling to multiple instances, add shared rate-limit and Socket.IO adapters. MongoDB transaction/inventory correctness is independent of those adapters.
- The notification inbox and order pages poll when sockets fail. Browser alerts are optional and not guaranteed; there is no background push-delivery service.
- Cleanup runs while the API process is alive. Sleeping instances delay cleanup. Use `npm run images:cleanup` for a manual batch rather than creating a paid background worker by default.
- Configure backups appropriate to your selected Atlas plan and test restoration separately. This repository does not claim a verified backup/restore or production-load test.
- Finish operator identity, support, retention, returns/refunds and legal content before public launch. Informational privacy and ordering pages describe implemented behavior and explicitly identify missing operator-specific details.

## Verification commands

```powershell
npm ci
npm test
npm run test:e2e
npm run build
npm run deploy:validate
# After actual Cloudinary credentials are configured:
npm run images:verify
```

Browser tests use installed Google Chrome by default. Set `PLAYWRIGHT_CHANNEL=msedge` to use Edge, or install Playwright Chromium and adjust the channel configuration. Tests start isolated MongoDB and web servers on ports 5109 and 5179. Their fixture users and stores never enter the application database.
