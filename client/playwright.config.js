import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 120000,
  expect: { timeout: 15000 },
  workers: 1,
  fullyParallel: false,
  projects: [
    { name: "ui", testMatch: "ui.spec.js" },
    { name: "bookings", testMatch: "bookings.spec.js" },
    { name: "core", testMatch: "marketplace.spec.js" },
    { name: "advanced", testMatch: "advanced.spec.js", dependencies: ["core"] },
  ],
  use: {
    baseURL: "http://127.0.0.1:5179",
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node ../server/scripts/e2e-server.js",
    url: "http://127.0.0.1:5179",
    timeout: 120000,
    reuseExistingServer: false,
  },
  reporter: "list",
});
