import { test, expect } from "@playwright/test";

test("English and Hindi switch immediately, preserve form input, persist after reload and fit mobile", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  const language = page.getByRole("combobox", { name: "Language / भाषा" });
  await expect(language).toHaveValue("en");
  await page.getByLabel("Email address").fill("neighbor@example.com");
  await page.getByLabel("Password", { exact: true }).fill("private-password");
  await language.selectOption("hi");
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(
    page.getByRole("heading", { name: "LocalCart में लॉग इन करें" }),
  ).toBeVisible();
  await expect(page.getByLabel("ईमेल पता")).toHaveValue("neighbor@example.com");
  await expect(page.getByLabel("पासवर्ड", { exact: true })).toHaveValue(
    "private-password",
  );
  await page.reload();
  await expect(language).toHaveValue("hi");
  await page.goto("/shops");
  await expect(
    page.getByRole("heading", { name: "अच्छी चीज़ें, पास ही।" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(language).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await language.selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "Good things, nearby." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("Hindi shopkeeper queue preserves order data and sends status codes in English", async ({
  page,
}) => {
  const shopId = "000000000000000000000001";
  const user = {
    id: "000000000000000000000002",
    role: "shopkeeper",
    name: "Neighbour Store Owner",
    email: "owner@example.com",
  };
  const shop = {
    _id: shopId,
    name: "Fresh Local Store",
    approvalStatus: "APPROVED",
    active: true,
  };
  const order = {
    _id: "000000000000000000000003",
    orderNumber: "LC-TEST-1",
    createdAt: new Date().toISOString(),
    orderStatus: "PENDING",
    fulfillmentMethod: "pickup",
    customerName: "Amit Kumar",
    phone: "9876543210",
    paymentMethod: "PAY_AT_STORE",
    paymentStatus: "UNPAID",
    totalAmount: 5000,
    deliveryFee: 0,
    items: [
      {
        productId: "000000000000000000000004",
        name: "Fresh Bread",
        unit: "pack",
        quantity: 1,
        price: 5000,
      },
    ],
    statusHistory: [],
  };
  let submitted;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let body = { items: [], total: 0, pages: 0 };
    if (url.pathname.endsWith("/auth/refresh"))
      body = { user, accessToken: "test-token" };
    else if (url.pathname.endsWith("/shops/mine")) body = { shop };
    else if (url.pathname.endsWith(`/orders/${order._id}/status`)) {
      submitted = route.request().postDataJSON();
      order.orderStatus = submitted.status;
      body = { order };
    } else if (url.pathname.endsWith(`/shops/${shopId}/orders`))
      body = { items: [order], total: 1, pages: 1 };
    await route.fulfill({ json: body });
  });
  await page.goto("/shopkeeper/orders");
  await page
    .getByRole("combobox", { name: "Language / भाषा" })
    .selectOption("hi");
  await expect(
    page.getByRole("heading", { name: "नए और चालू ऑर्डर" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "पिछले ऑर्डर" })).toBeVisible();
  await expect(page.getByText("Fresh Bread", { exact: false })).toBeVisible();
  await expect(page.getByText("Amit Kumar", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Fresh Local Store" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "स्वीकार करें", exact: true }).click();
  await expect.poll(() => submitted?.status).toBe("ACCEPTED");
  await expect(
    page.getByRole("button", { name: "तैयारी शुरू करें", exact: true }),
  ).toBeVisible();
});

test("email fields suggest Gmail after @ and support click, keyboard selection and other domains", async ({
  page,
}) => {
  const signInRequests = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().endsWith("/api/auth/login")
    )
      signInRequests.push(request);
  });
  await page.goto("/login");
  const email = page.getByLabel("Email address");
  await email.fill("neighbor@");
  await expect(
    page.getByRole("option", { name: /neighbor@gmail.com/ }),
  ).toBeVisible();
  await email.press("Enter");
  await expect(email).toHaveValue("neighbor@gmail.com");
  await expect(
    page.getByRole("listbox", { name: "Email suggestions" }),
  ).toHaveCount(0);
  expect(signInRequests).toHaveLength(0);
  await email.fill("neighbor@gm");
  await page.getByRole("option", { name: /neighbor@gmail.com/ }).click();
  await expect(email).toHaveValue("neighbor@gmail.com");
  await email.fill("neighbor@example.com");
  await expect(
    page.getByRole("listbox", { name: "Email suggestions" }),
  ).toHaveCount(0);
  await expect(email).toHaveValue("neighbor@example.com");
  await email.fill("neighbor@");
  await email.press("Escape");
  await expect(
    page.getByRole("listbox", { name: "Email suggestions" }),
  ).toHaveCount(0);
  await page.goto("/register");
  await page.getByLabel("Email address").fill("newneighbor@");
  await page.getByLabel("Email address").press("Tab");
  await expect(page.getByLabel("Email address")).toHaveValue(
    "newneighbor@gmail.com",
  );
  await expect(page.getByLabel("Mobile number", { exact: true })).toBeFocused();
});
