import { test, expect } from "@playwright/test";
import sharp from "sharp";
// Runs after marketplace.spec.js via a project dependency; uses its isolated fixtures.
async function login(page, email, password) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
}
async function noOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}
test("delivery, catalog setup, support settings and mobile dashboards use the real APIs", async ({
  browser,
}) => {
  const adminContext = await browser.newContext(),
    buyerContext = await browser.newContext(),
    ownerContext = await browser.newContext();
  const admin = await adminContext.newPage(),
    buyer = await buyerContext.newPage(),
    owner = await ownerContext.newPage();
  const errors = [];
  for (const p of [admin, buyer, owner])
    p.on("pageerror", (error) => errors.push(error.message));
  await login(admin, "admin@localcart.test", "test-admin-password-123");
  await admin.goto("/admin/shops");
  await admin
    .getByRole("row")
    .filter({ hasText: "Meera Neighborhood Groceries" })
    .getByRole("link", { name: "Review store" })
    .click();
  const delivery = admin.locator(".panel").filter({
    has: admin.getByRole("heading", {
      name: "Delivery configuration",
      exact: true,
    }),
  });
  await delivery.getByLabel("Home delivery").selectOption("true");
  await delivery.getByLabel("Delivery fee (₹)").fill("25");
  await delivery.getByLabel("Minimum item subtotal (₹)").fill("50");
  await delivery
    .getByLabel("Serviceable PIN codes (comma separated)")
    .fill("411045");
  await delivery
    .getByLabel("Delivery window estimates (one per line)")
    .fill("Evening 5pm–7pm");
  await delivery
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(admin.getByRole("status")).toContainText("Saved successfully");
  const subscription = admin.locator(".panel").filter({
    has: admin.getByRole("heading", {
      name: "Manual subscription",
      exact: true,
    }),
  });
  await subscription.getByLabel("Plan name").fill("Neighborhood");
  await subscription.getByLabel("Plan amount (₹)").fill("199");
  await subscription.getByLabel("Start date").fill("2026-11-01");
  await subscription.getByLabel("End date").fill("2026-12-01");
  await subscription
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(admin.getByRole("status")).toContainText("Saved successfully");
  await admin.reload();
  await expect(admin.getByLabel("Plan name")).toHaveValue("Neighborhood");
  await expect(admin.getByLabel("Start date")).toHaveValue("2026-11-01");
  await admin.goto("/admin/catalog");
  await admin.getByLabel("Branded product name").fill("Common Branded Milk");
  await admin.getByLabel("Unit / pack size").fill("1 litre");
  await admin.getByLabel("Barcode (optional)").fill("1234567890123");
  await admin
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(
    admin.getByRole("heading", { name: "Common Branded Milk" }),
  ).toBeVisible();
  await admin.getByRole("button", { name: "Edit & manage image" }).click();
  const png = await sharp({
    create: { width: 40, height: 40, channels: 3, background: "green" },
  })
    .png()
    .toBuffer();
  await admin
    .locator("input[type=file]")
    .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: png });
  await expect(admin.getByRole("alert")).toContainText("Cloudinary");
  await admin.goto("/admin/settings");
  await admin.getByLabel("Support email").fill("support@localcart.test");
  await admin.getByLabel("Platform fee in basis points").fill("100");
  await admin
    .getByLabel("Public platform notice")
    .fill("Welcome to your neighborhood marketplace.");
  await admin
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(admin.getByRole("status")).toContainText("Saved successfully");
  await login(buyer, "buyer@localcart.test", "test-neighborhood-password");
  await buyer.goto("/shops");
  await buyer
    .getByRole("link", { name: /Meera Neighborhood Groceries/ })
    .click();
  await buyer
    .getByLabel("Request a product")
    .fill("Please list fresh brown bread.");
  await buyer.getByRole("button", { name: "Send request" }).click();
  await expect(buyer.getByRole("status")).toContainText("request was sent");
  await buyer.getByRole("button", { name: "Add", exact: true }).click();
  await buyer.goto("/checkout");
  await buyer.getByLabel("Pickup or delivery").selectOption("delivery");
  await buyer
    .getByLabel("Delivery address", { exact: true })
    .fill("22 New Road");
  await buyer.getByLabel("Delivery city").fill("Pune");
  await buyer.getByLabel("Delivery PIN").fill("411045");
  await buyer
    .getByLabel("Delivery window", { exact: true })
    .selectOption("Evening 5pm–7pm");
  await buyer.getByRole("button", { name: "Review current prices" }).click();
  await expect(
    buyer.getByRole("button", { name: "Submit order · ₹85.00" }),
  ).toBeVisible();
  await buyer.getByRole("button", { name: "Submit order · ₹85.00" }).click();
  await expect(buyer).toHaveURL(/\/orders\//);
  await expect(buyer.locator(".pickup-code")).toHaveCount(0);
  await login(owner, "owner@localcart.test", "test-neighborhood-password");
  await owner.goto("/shopkeeper/orders");
  await owner
    .getByRole("button", { name: "Mark accepted", exact: true })
    .click();
  await owner
    .getByRole("button", { name: "Mark preparing", exact: true })
    .click();
  await owner
    .getByRole("button", { name: "Mark out for delivery", exact: true })
    .click();
  await owner
    .getByRole("button", { name: "Mark completed", exact: true })
    .click();
  await expect(buyer.locator(".badge-completed")).toBeVisible({
    timeout: 10000,
  });
  await owner.goto("/shopkeeper/requests");
  await expect(owner.getByText("Please list fresh brown bread.")).toBeVisible();
  await owner
    .getByRole("button", { name: "Close request", exact: true })
    .click();
  await expect(owner.getByRole("button", { name: "Reopen" })).toBeVisible();
  await owner.setViewportSize({ width: 390, height: 844 });
  await owner.goto("/shopkeeper");
  await expect(
    owner.getByText("Today’s completed sales", { exact: true }),
  ).toBeVisible();
  await noOverflow(owner);
  await owner.screenshot({
    path: "../artifacts/shopkeeper-mobile.png",
    fullPage: true,
  });
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.goto("/admin");
  await expect(
    admin.getByText("Earned platform fees", { exact: true }),
  ).toBeVisible();
  await noOverflow(admin);
  await admin.screenshot({
    path: "../artifacts/admin-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await adminContext.close();
  await buyerContext.close();
  await ownerContext.close();
});
test("PWA has a manifest and an offline fallback without caching order data", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  const manifest = await page.request.get("/manifest.webmanifest");
  expect((await manifest.json()).display).toBe("standalone");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.goto("/orders");
  await expect(
    page.getByRole("heading", { name: "A little pause." }),
  ).toBeVisible();
  await context.setOffline(false);
  await context.close();
});
