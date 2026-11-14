import { test, expect } from "@playwright/test";
import fs from "node:fs";
async function register(page, email, name) {
  await page.goto("/register");
  await page.getByLabel("Full name", { exact: true }).fill(name);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Mobile number", { exact: true }).fill("9876543210");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-neighborhood-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: `Hello, ${name.split(" ")[0]}.` }),
  ).toBeVisible();
}
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
test("desktop: application, physical approval, inventory, customer checkout, live order, verified pickup", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const customerContext = await browser.newContext();
  const owner = await ownerContext.newPage(),
    admin = await adminContext.newPage(),
    buyer = await customerContext.newPage();
  const errors = [];
  for (const page of [owner, admin, buyer])
    page.on("pageerror", (error) => errors.push(error.message));
  await register(owner, "owner@localcart.test", "Meera Shopkeeper");
  await owner.goto("/apply");
  for (const [label, value] of [
    ["Shop name", "Meera Neighborhood Groceries"],
    ["Store category", "Groceries"],
    ["Shop mobile number", "9876543210"],
    ["Street address", "12 Market Road"],
    ["City", "Pune"],
    ["Neighborhood", "Baner"],
    ["PIN code", "411045"],
    [
      "Tell customers about your shop",
      "Fresh essentials for our neighborhood.",
    ],
  ])
    await owner.getByLabel(label, { exact: true }).fill(value);
  await owner.getByRole("button", { name: "Submit for verification" }).click();
  await expect(
    owner.getByText("PENDING APPROVAL", { exact: true }),
  ).toBeVisible();
  await login(admin, "admin@localcart.test", "test-admin-password-123");
  await admin.goto("/admin/shops");
  await admin
    .getByRole("row")
    .filter({ hasText: "Meera Neighborhood Groceries" })
    .getByRole("link", { name: "Review store" })
    .click();
  await admin
    .getByLabel("Physical verification completed?")
    .selectOption("true");
  await admin
    .getByLabel("Internal verification notes / reason")
    .fill("Verified owner and premises in person.");
  await admin.getByRole("button", { name: "Record decision" }).click();
  await expect(admin.getByText("APPROVED", { exact: true })).toBeVisible();
  await owner.goto("/shopkeeper/categories");
  await owner.getByLabel("Category name").fill("Dairy");
  await owner
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(owner.getByText("Dairy", { exact: true })).toBeVisible();
  await owner.goto("/shopkeeper/products");
  await owner.getByRole("button", { name: "+ Add product" }).click();
  await owner
    .getByLabel("Product name", { exact: true })
    .fill("Local Fresh Milk");
  await owner
    .getByLabel("Category", { exact: true })
    .selectOption({ label: "Dairy" });
  await owner.getByLabel("Selling price (₹)").fill("60");
  await owner.getByLabel("MRP (₹, 0 if unused)").fill("65");
  await owner.getByLabel("Unit or pack size").fill("1 litre");
  await owner.getByLabel("Track exact stock?").selectOption("true");
  await owner.getByLabel("Unreserved stock quantity").fill("5");
  await owner
    .getByRole("button", { name: "Create product", exact: true })
    .click();
  await expect(
    owner.getByText("Local Fresh Milk", { exact: true }),
  ).toBeVisible();
  await register(buyer, "buyer@localcart.test", "Asha Customer");
  await buyer.goto("/shops");
  await buyer
    .getByRole("link", { name: /Meera Neighborhood Groceries/ })
    .click();
  await buyer.getByRole("button", { name: "Add", exact: true }).click();
  await buyer.goto("/cart");
  await expect(
    buyer.getByText("Local Fresh Milk", { exact: true }),
  ).toBeVisible();
  await buyer.getByRole("link", { name: "Continue to purchase" }).click();
  await buyer.getByRole("button", { name: "Review current prices" }).click();
  await expect(buyer.getByText("Server-confirmed quote")).toBeVisible();
  await buyer.getByRole("button", { name: /Submit order/ }).click();
  await expect(buyer).toHaveURL(/\/orders\//);
  await expect(buyer.getByText("PENDING", { exact: true })).toBeVisible();
  await expect(buyer.locator(".order-number-pending")).toHaveCSS(
    "color",
    "rgb(185, 28, 28)",
  );
  const code = (await buyer.locator(".pickup-code strong").innerText()).trim();
  await owner.goto("/shopkeeper");
  const pendingCount = owner
    .locator(".metric")
    .filter({ hasText: "Pending orders" })
    .locator("strong");
  await expect(pendingCount).toHaveText("1");
  await expect(pendingCount).toHaveCSS("color", "rgb(185, 28, 28)");
  await owner.goto("/shopkeeper/orders");
  await expect(owner.locator(".order-number-pending")).toHaveCSS(
    "color",
    "rgb(185, 28, 28)",
  );
  await owner
    .getByRole("button", { name: "Mark accepted", exact: true })
    .click();
  await owner
    .getByRole("button", { name: "Mark preparing", exact: true })
    .click();
  await owner
    .getByRole("button", { name: "Mark ready for pickup", exact: true })
    .click();
  await owner.getByLabel("Pickup verification code").fill(code);
  await expect(buyer.locator(".badge-ready_for_pickup")).toBeVisible({
    timeout: 10000,
  });
  await owner.getByRole("button", { name: "Verify pickup & complete" }).click();
  await expect(owner.locator(".order-detail")).toHaveCount(0);
  await owner.getByRole("link", { name: "Past orders", exact: true }).click();
  await expect(owner.locator(".badge-completed")).toBeVisible();
  await buyer.reload();
  await expect(buyer.getByText("COMPLETED", { exact: true })).toBeVisible();
  await expect(buyer.locator(".pickup-code")).toHaveCount(0);
  await admin.goto("/admin");
  await expect(
    admin
      .locator(".metric")
      .filter({ hasText: "Completed merchandise value" })
      .getByText("₹60.00", { exact: true }),
  ).toBeVisible();
  fs.mkdirSync("../artifacts", { recursive: true });
  await buyer.goto("/shops");
  await expect(
    buyer.getByRole("link", { name: /Meera Neighborhood Groceries/ }),
  ).toBeVisible();
  await buyer.screenshot({
    path: "../artifacts/customer-desktop.png",
    fullPage: true,
  });
  await owner.goto("/shopkeeper");
  await expect(
    owner.getByText("Today’s completed sales", { exact: true }),
  ).toBeVisible();
  await owner.screenshot({
    path: "../artifacts/shopkeeper-desktop.png",
    fullPage: true,
  });
  await admin.screenshot({
    path: "../artifacts/admin-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await ownerContext.close();
  await adminContext.close();
  await customerContext.close();
});
test("mobile: landing, location, browsing, single-store basket and profile have no horizontal overflow", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Your favorite/ }),
  ).toBeVisible();
  await noOverflow(page);
  fs.mkdirSync("../artifacts", { recursive: true });
  await page.screenshot({
    path: "../artifacts/customer-mobile.png",
    fullPage: true,
  });
  await page.goto("/shops");
  await page.getByRole("button", { name: /Choose your neighborhood/ }).click();
  await page.getByLabel("City", { exact: true }).fill("Pune");
  await page.getByLabel("Postal PIN code").fill("411045");
  await page.getByRole("button", { name: "Use this location" }).click();
  await expect(
    page.getByRole("link", { name: /Meera Neighborhood Groceries/ }),
  ).toBeVisible();
  await noOverflow(page);
  await page
    .getByRole("link", { name: /Meera Neighborhood Groceries/ })
    .click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const prompt = page.getByRole("dialog", { name: "Sign in to buy" });
  await expect(prompt).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("lc-cart")).items.length,
    ),
  ).toBe(0);
  await page.keyboard.press("Escape");
  await expect(prompt).toHaveCount(0);
  await page
    .getByRole("button", { name: "View Local Fresh Milk", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add to basket", exact: true })
    .click();
  await expect(prompt).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(prompt).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Local Fresh Milk" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await prompt.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await register(page, "mobile@localcart.test", "Mobile Customer");
  await page.goto("/shops");
  await page
    .getByRole("link", { name: /Meera Neighborhood Groceries/ })
    .click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.goto("/cart");
  await expect(
    page.getByText("Local Fresh Milk", { exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await page.goto("/account");
  await page.getByRole("button", { name: "+ Add address" }).click();
  for (const [label, value] of [
    ["Label", "Home"],
    ["Street address", "22 New Road"],
    ["City", "Pune"],
    ["PIN code", "411045"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toContainText("Profile updated");
  await page.reload();
  await expect(page.getByLabel("Street address")).toHaveValue("22 New Road");
  await noOverflow(page);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/account$/);
  await context.close();
});

test("guests can open sign-in prompts for zero-stock and closed-store items without a loading cursor", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const loginResponse = await ownerContext.request.post("/api/auth/login", {
    data: {
      email: "owner@localcart.test",
      password: "test-neighborhood-password",
    },
  });
  expect(loginResponse.ok()).toBe(true);
  const { accessToken } = await loginResponse.json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const { shop } = await (
    await ownerContext.request.get("/api/shops/mine", { headers })
  ).json();
  const { items } = await (
    await ownerContext.request.get(`/api/manage/shops/${shop._id}/products`, {
      headers,
    })
  ).json();
  const product = items[0];
  const original = {
    name: product.name,
    description: product.description || "",
    categoryId: product.categoryId,
    catalogId: product.catalogId?._id || null,
    price: product.price,
    mrp: product.mrp ?? null,
    unit: product.unit,
    stockQuantity: product.stockQuantity,
    inventoryTrackingEnabled: product.inventoryTrackingEnabled,
    availabilityStatus: product.availabilityStatus,
    active: product.active,
  };
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  const customerContext = await browser.newContext();
  const customer = await customerContext.newPage();
  try {
    expect(
      (
        await ownerContext.request.patch(`/api/products/${product._id}`, {
          headers,
          data: {
            ...original,
            stockQuantity: 0,
            inventoryTrackingEnabled: true,
          },
        })
      ).ok(),
    ).toBe(true);
    await guest.goto(`/shop/${shop.slug}`);
    const add = guest.getByRole("button", { name: "Add", exact: true });
    await expect(add).toBeEnabled();
    await expect(add).toHaveCSS("cursor", "pointer");
    await add.click();
    await expect(
      guest.getByRole("dialog", { name: "Sign in to buy" }),
    ).toBeVisible();
    expect(
      await guest.evaluate(
        () => JSON.parse(localStorage.getItem("lc-cart")).items.length,
      ),
    ).toBe(0);
    await guest
      .getByRole("button", { name: "Continue browsing", exact: true })
      .click();
    await guest
      .getByRole("button", { name: `View ${product.name}`, exact: true })
      .click();
    await guest
      .getByRole("button", { name: "Add to basket", exact: true })
      .click();
    await expect(
      guest.getByRole("dialog", { name: "Sign in to buy" }),
    ).toBeVisible();
    await login(customer, "buyer@localcart.test", "test-neighborhood-password");
    await customer.goto(`/shop/${shop.slug}`);
    await expect(
      customer.getByRole("button", { name: "Out of stock", exact: true }),
    ).toBeDisabled();
    await expect(
      customer.getByRole("button", { name: "Out of stock", exact: true }),
    ).toHaveCSS("cursor", "not-allowed");
    expect(
      (
        await ownerContext.request.patch(`/api/shops/${shop._id}`, {
          headers,
          data: { temporarilyClosed: true },
        })
      ).ok(),
    ).toBe(true);
    await guest.goto(`/shop/${shop.slug}`);
    await guest.getByRole("button", { name: "Add", exact: true }).click();
    await expect(
      guest.getByRole("dialog", { name: "Sign in to buy" }),
    ).toBeVisible();
    await customer.reload();
    await expect(
      customer.getByRole("button", { name: "Store closed", exact: true }),
    ).toBeDisabled();
  } finally {
    await ownerContext.request.patch(`/api/products/${product._id}`, {
      headers,
      data: original,
    });
    await ownerContext.request.patch(`/api/shops/${shop._id}`, {
      headers,
      data: { temporarilyClosed: false },
    });
    await guestContext.close();
    await customerContext.close();
    await ownerContext.close();
  }
});

test("shopkeepers can edit and bulk-update availability through refresh, while account switches cannot replay their edits", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page, "owner@localcart.test", "test-neighborhood-password");
  await page.goto("/shopkeeper/products");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Availability", { exact: true })
    .selectOption("OUT_OF_STOCK");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page.locator("tbody .badge-out_of_stock")).toBeVisible();
  await page.getByRole("checkbox", { name: "Select Local Fresh Milk" }).check();
  await page.getByRole("button", { name: "AVAILABLE", exact: true }).click();
  await expect(page.locator("tbody .badge-available")).toBeVisible();
  const ownerToken = await page.evaluate(async () =>
    (await import("/src/services/api.js")).getAccessToken(),
  );
  const { shop } = await (
    await context.request.get("/api/shops/mine", {
      headers: { Authorization: `Bearer ${ownerToken}` },
    })
  ).json();
  const { items } = await (
    await context.request.get(`/api/manage/shops/${shop._id}/products`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    })
  ).json();
  try {
    await page.evaluate(async () =>
      (await import("/src/services/api.js")).setAccessToken(
        "expired-test-token",
      ),
    );
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page
      .getByLabel("Availability", { exact: true })
      .selectOption("CONFIRM_AVAILABILITY");
    await page
      .getByRole("button", { name: "Save product", exact: true })
      .click();
    await expect(
      page.locator("tbody .badge-confirm_availability"),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/shopkeeper\/products$/);
    // A second sign-in in the same browser replaces the shared refresh cookie.
    expect(
      (
        await context.request.post("/api/auth/login", {
          data: {
            email: "buyer@localcart.test",
            password: "test-neighborhood-password",
          },
        })
      ).ok(),
    ).toBe(true);
    await page.evaluate(async () =>
      (await import("/src/services/api.js")).setAccessToken(
        "expired-test-token",
      ),
    );
    const availabilityResponses = [];
    page.on("response", (response) => {
      if (
        response.request().method() === "PATCH" &&
        response.url().endsWith("/availability")
      )
        availabilityResponses.push(response.status());
    });
    await page
      .getByRole("checkbox", { name: "Select Local Fresh Milk" })
      .check();
    await page
      .getByRole("button", { name: "OUT OF STOCK", exact: true })
      .click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(
      page.getByRole("heading", { name: "Hello, Asha." }),
    ).toBeVisible();
    expect(availabilityResponses).toEqual([401]);
    const { product } = await (
      await context.request.get(`/api/products/${items[0]._id}`)
    ).json();
    expect(product.availabilityStatus).toBe("CONFIRM_AVAILABILITY");
    expect(errors).toEqual([]);
  } finally {
    await context.request.patch(`/api/shops/${shop._id}/availability`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
      data: { ids: [items[0]._id], availabilityStatus: "AVAILABLE" },
    });
    await context.close();
  }
});

test("stock limits cap product selection, repeated additions, basket increments and restored baskets", async ({
  browser,
}) => {
  const owner = await browser.newContext();
  const { accessToken } = await (
    await owner.request.post("/api/auth/login", {
      data: {
        email: "owner@localcart.test",
        password: "test-neighborhood-password",
      },
    })
  ).json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const { shop } = await (
    await owner.request.get("/api/shops/mine", { headers })
  ).json();
  const { items } = await (
    await owner.request.get(`/api/manage/shops/${shop._id}/products`, {
      headers,
    })
  ).json();
  const p = items[0];
  const original = {
    name: p.name,
    description: p.description || "",
    categoryId: p.categoryId,
    catalogId: p.catalogId?._id || null,
    price: p.price,
    mrp: p.mrp ?? null,
    unit: p.unit,
    stockQuantity: p.stockQuantity,
    inventoryTrackingEnabled: p.inventoryTrackingEnabled,
    availabilityStatus: p.availabilityStatus,
    active: p.active,
  };
  const customer = await browser.newContext();
  const page = await customer.newPage();
  try {
    expect(
      (
        await owner.request.patch(`/api/products/${p._id}`, {
          headers,
          data: {
            ...original,
            stockQuantity: 10,
            inventoryTrackingEnabled: true,
            availabilityStatus: "AVAILABLE",
          },
        })
      ).ok(),
    ).toBe(true);
    await login(page, "buyer@localcart.test", "test-neighborhood-password");
    await page.goto(`/shop/${shop.slug}`);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page
      .getByRole("button", { name: `View ${p.name}`, exact: true })
      .click();
    await page.getByLabel("Product quantity").fill("30");
    await expect(page.getByLabel("Product quantity")).toHaveValue("9");
    await page
      .getByRole("button", { name: "Add to basket", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Close product", exact: true })
      .click();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("capped at 10");
    await page.goto("/cart");
    await expect(
      page.getByText("Maximum available: 10", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Increase ${p.name}` }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("lc-cart")).items[0].quantity,
      ),
    ).toBe(10);
    await page.getByRole("button", { name: `Decrease ${p.name}` }).click();
    await expect(
      page.getByRole("button", { name: `Increase ${p.name}` }),
    ).toBeEnabled();
    await page.getByRole("button", { name: `Increase ${p.name}` }).click();
    await expect(
      page.getByRole("button", { name: `Increase ${p.name}` }),
    ).toBeDisabled();
    expect(
      (
        await owner.request.patch(`/api/products/${p._id}`, {
          headers,
          data: {
            ...original,
            stockQuantity: 3,
            inventoryTrackingEnabled: true,
            availabilityStatus: "AVAILABLE",
          },
        })
      ).ok(),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByText("Maximum available: 3", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("lc-cart")).items[0].quantity,
      ),
    ).toBe(3);
    await expect(
      page.getByRole("button", { name: `Increase ${p.name}` }),
    ).toBeDisabled();
  } finally {
    await owner.request.patch(`/api/products/${p._id}`, {
      headers,
      data: original,
    });
    await customer.close();
    await owner.close();
  }
});
