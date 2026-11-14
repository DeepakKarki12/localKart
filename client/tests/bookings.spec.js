import { test, expect } from "@playwright/test";

const base = "http://127.0.0.1:5179";
const password = "test-service-bookings-password";
async function createUser(browser, name, email) {
  const context = await browser.newContext({ baseURL: base });
  const response = await context.request.post("/api/auth/register", {
    data: { name, email, password, phone: "9876543210" },
  });
  expect(response.status()).toBe(201);
  const data = await response.json();
  return {
    context,
    page: await context.newPage(),
    token: data.accessToken,
    name,
  };
}
const headers = (user) => ({ Authorization: `Bearer ${user.token}` });
async function createBusiness(browser, type, name, suffix) {
  const owner = await createUser(
    browser,
    `${name} Owner`,
    `${suffix}-owner@bookings.local`,
  );
  const applied = await owner.context.request.post("/api/shops/apply", {
    headers: headers(owner),
    data: {
      name,
      businessType: type,
      category: type === "CLASSES" ? "Yoga and fitness" : "Barber",
      description: "Your friendly neighbourhood service.",
      address: "12 Market Road",
      city: "Pune",
      neighborhood: "Baner",
      pinCode: "411045",
      phone: "9876543210",
    },
  });
  expect(applied.status()).toBe(201);
  const { shop } = await applied.json();
  const admin = await browser.newContext({ baseURL: base });
  try {
    const login = await admin.request.post("/api/auth/login", {
      data: {
        email: "admin@localcart.test",
        password: "test-admin-password-123",
      },
    });
    expect(login.status()).toBe(200);
    const { accessToken } = await login.json();
    const approval = await admin.request.patch(
      `/api/admin/shops/${shop._id}/approval`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: {
          status: "APPROVED",
          notes: "Verified test business and service details.",
          physicallyVerified: true,
        },
      },
    );
    expect(approval.status()).toBe(200);
  } finally {
    await admin.close();
  }
  return { owner, shop };
}
async function noOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}

test("classes: provider schedules a session, customer reserves the last seat and receives a private joining link", async ({
  browser,
}) => {
  const { owner, shop } = await createBusiness(
    browser,
    "CLASSES",
    "Flow Online Studio",
    "classes",
  );
  const customer = await createUser(
    browser,
    "Ananya Learner",
    "class-customer@bookings.local",
  );
  const second = await createUser(
    browser,
    "Second Learner",
    "class-second@bookings.local",
  );
  const errors = [];
  for (const person of [owner, customer, second])
    person.page.on("pageerror", (error) => errors.push(error.message));
  try {
    await owner.page.goto("/shopkeeper");
    await expect(
      owner.page.getByRole("heading", { name: "Manage classes" }),
    ).toBeVisible();
    await owner.page.getByRole("button", { name: "Schedule a class" }).click();
    await owner.page.getByLabel("Session title").fill("Beginner Yoga Flow");
    await owner.page.getByLabel("Class type").selectOption("YOGA");
    await owner.page
      .getByLabel("Description", { exact: true })
      .fill("A gentle live yoga session for beginners.");
    const indiaTime = (hours) =>
      new Date(Date.now() + hours * 3600000 + 330 * 60000)
        .toISOString()
        .slice(0, 16);
    await owner.page.getByLabel("Starts at (India time)").fill(indiaTime(2));
    await owner.page.getByLabel("Ends at (India time)").fill(indiaTime(3));
    await owner.page.getByLabel("Total seats").fill("1");
    await owner.page
      .getByLabel("Private meeting link")
      .fill("https://meet.example.com/private-yoga-flow");
    await owner.page
      .getByLabel("Starts at (India time)")
      .fill("2020-01-01T10:00");
    await owner.page.getByRole("button", { name: "Publish session" }).click();
    await expect(
      owner.page
        .getByRole("alert")
        .filter({ hasText: "Choose a start time in the future (India time)." }),
    ).toBeVisible();
    await owner.page.getByLabel("Starts at (India time)").fill(indiaTime(2));
    await owner.page.getByLabel("Ends at (India time)").fill(indiaTime(1));
    await owner.page.getByRole("button", { name: "Publish session" }).click();
    await expect(
      owner.page
        .getByRole("alert")
        .filter({ hasText: "The end time must be after the start time." }),
    ).toBeVisible();
    await owner.page.getByLabel("Ends at (India time)").fill(indiaTime(3));
    await owner.page
      .getByLabel("Private meeting link")
      .fill("http://meet.example.com/private-yoga-flow");
    await owner.page.getByRole("button", { name: "Publish session" }).click();
    await expect(
      owner.page
        .getByRole("alert")
        .filter({ hasText: "Use a secure HTTPS meeting link." }),
    ).toBeVisible();
    await owner.page
      .getByLabel("Private meeting link")
      .fill("  https://meet.example.com/private-yoga-flow  ");
    // A server-side rejection must expose its specific field error, not just the generic summary.
    await owner.page.route(
      `**/api/shops/${shop._id}/class-sessions`,
      async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        await route.fulfill({
          status: 400,
          json: {
            message: "Please check your details.",
            errors: [
              {
                field: "startsAt",
                message: "Choose a start time in the future (India time).",
              },
            ],
          },
        });
      },
    );
    await owner.page.getByRole("button", { name: "Publish session" }).click();
    await expect(
      owner.page.getByLabel("Starts at (India time)"),
    ).toHaveAttribute("aria-invalid", "true");
    await expect(owner.page.locator("form .notice")).toHaveText(
      "Choose a start time in the future (India time).",
    );
    await owner.page.unroute(`**/api/shops/${shop._id}/class-sessions`);
    await owner.page.getByLabel("Starts at (India time)").fill(indiaTime(2.1));
    await owner.page.getByRole("button", { name: "Publish session" }).click();
    await expect(
      owner.page.getByRole("heading", { name: "Beginner Yoga Flow" }),
    ).toBeVisible();
    await customer.page.goto("/classes");
    const card = customer.page.locator("article").filter({
      has: customer.page.getByRole("heading", { name: "Beginner Yoga Flow" }),
    });
    await expect(card.getByText("1 seat left")).toBeVisible();
    await customer.page.screenshot({
      path: "../artifacts/classes-desktop.png",
      fullPage: true,
    });
    await card.getByRole("button", { name: "Reserve my seat" }).click();
    await expect(customer.page).toHaveURL(/\/bookings$/);
    await expect(
      customer.page.getByRole("link", { name: "Join online class" }),
    ).toHaveAttribute("href", "https://meet.example.com/private-yoga-flow");
    await second.page.goto(`/shop/${shop.slug}`);
    await expect(
      second.page.getByRole("button", { name: "Class full" }),
    ).toBeDisabled();
    await owner.page.getByRole("button", { name: "View participants" }).click();
    await expect(
      owner.page.getByRole("listitem").filter({ hasText: customer.name }),
    ).toBeVisible();
    await customer.page.getByRole("button", { name: "Cancel booking" }).click();
    await expect(
      customer.page.getByText("CANCELLED", { exact: true }),
    ).toBeVisible();
    await expect(
      customer.page.getByRole("link", { name: "Join online class" }),
    ).toHaveCount(0);
    await expect(
      second.page.getByRole("button", { name: "Reserve my seat" }),
    ).toBeEnabled();
    await second.page.getByRole("button", { name: "Reserve my seat" }).click();
    await owner.page
      .getByRole("button", { name: "Cancel session", exact: true })
      .click();
    await owner.page
      .getByRole("button", { name: "Confirm cancellation" })
      .click();
    await expect(
      second.page.getByText("CANCELLED", { exact: true }),
    ).toBeVisible();
    await expect(
      second.page.getByRole("link", { name: "Join online class" }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([
      owner.context.close(),
      customer.context.close(),
      second.context.close(),
    ]);
  }
});

test("barber: live positions, red arrival alert, swipe acceptance, absent-customer rejection and completion", async ({
  browser,
}) => {
  const { owner, shop } = await createBusiness(
    browser,
    "BARBER",
    "Neighbourhood Barber",
    "barber",
  );
  const customers = [];
  for (let index = 1; index <= 3; index++)
    customers.push(
      await createUser(
        browser,
        `Barber Customer ${index}`,
        `barber-customer-${index}@bookings.local`,
      ),
    );
  const errors = [];
  for (const person of [owner, ...customers])
    person.page.on("pageerror", (error) => errors.push(error.message));
  try {
    for (const person of customers) {
      await person.page.goto(`/shop/${shop.slug}`);
      await person.page.getByRole("button", { name: "Join the queue" }).click();
      await expect(person.page).toHaveURL(/\/bookings$/);
    }
    const third = customers[2].page;
    await expect(third.locator(".queue-position strong")).toHaveText("3");
    await expect(third.locator(".queue-urgent")).toHaveCount(0);
    await owner.page.goto("/shopkeeper");
    await expect(
      owner.page.getByRole("heading", { name: "Live barber queue" }),
    ).toBeVisible();
    const slider = owner.page.getByRole("slider", { name: "Swipe to accept" });
    const box = await slider.boundingBox();
    await owner.page.mouse.move(box.x + 25, box.y + box.height / 2);
    await owner.page.mouse.down();
    await owner.page.mouse.move(
      box.x + box.width - 24,
      box.y + box.height / 2,
      { steps: 12 },
    );
    await owner.page.mouse.up();
    await expect(owner.page.locator(".ongoing-job")).toContainText(
      customers[0].name,
    );
    await expect(third.locator(".queue-position strong")).toHaveText("2");
    await expect(
      third
        .getByRole("alert")
        .filter({ hasText: "Reach the store to avoid missing your turn." }),
    ).toBeVisible();
    await expect(third.locator(".queue-urgent")).toHaveCount(1);
    await third.setViewportSize({ width: 360, height: 800 });
    await noOverflow(third);
    await third.screenshot({
      path: "../artifacts/barber-customer-mobile.png",
      fullPage: true,
    });
    await third
      .getByRole("combobox", { name: "Language / भाषा" })
      .selectOption("hi");
    await expect(
      third
        .getByRole("alert")
        .filter({ hasText: "अपनी बारी छूटने से बचाने के लिए दुकान पहुँचें।" }),
    ).toBeVisible();
    await noOverflow(third);
    await third
      .getByRole("combobox", { name: "Language / भाषा" })
      .selectOption("en");
    await owner.page.screenshot({
      path: "../artifacts/barber-dashboard-desktop.png",
      fullPage: true,
    });
    await owner.page.getByRole("button", { name: "Complete job" }).click();
    const absent = owner.page
      .locator(".waiting-customer")
      .filter({ hasText: customers[1].name });
    await absent
      .getByRole("button", { name: "Customer absent / reject" })
      .click();
    await absent
      .getByLabel("Reason", { exact: true })
      .fill("Customer not present when called");
    await absent.getByRole("button", { name: "Reject appointment" }).click();
    await expect(
      customers[1].page.getByText("REJECTED", { exact: true }),
    ).toBeVisible();
    await expect(third.locator(".queue-position strong")).toHaveText("1");
    await owner.page.getByRole("slider", { name: "Swipe to accept" }).focus();
    await owner.page.keyboard.press("End");
    await expect(owner.page.locator(".ongoing-job")).toContainText(
      customers[2].name,
    );
    await expect(third.getByText("Your service is in progress.")).toBeVisible();
    await owner.page.getByRole("button", { name: "Complete job" }).click();
    await expect(third.getByText("COMPLETED", { exact: true })).toBeVisible();
    await owner.page.getByRole("button", { name: "Pause bookings" }).click();
    await third.goto(`/shop/${shop.slug}`);
    await expect(
      third.getByRole("button", { name: "Join the queue" }),
    ).toBeDisabled();
    await owner.page.setViewportSize({ width: 360, height: 800 });
    await noOverflow(owner.page);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([
      owner.context.close(),
      ...customers.map((person) => person.context.close()),
    ]);
  }
});
