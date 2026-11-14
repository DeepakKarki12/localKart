import { test } from "node:test";
import assert from "node:assert/strict";
import { openingState } from "../../shared/opening-hours.js";
test("opening hours use India time and correctly carry overnight hours into the next day", () => {
  const shop = {
    openingHours: [
      { day: 1, open: "21:00", close: "02:00", closed: false },
      { day: 2, open: "09:00", close: "18:00", closed: false },
    ],
  };
  assert.equal(
    openingState(shop, new Date("2026-11-16T22:00:00+05:30")).open,
    true,
  );
  assert.equal(
    openingState(shop, new Date("2026-11-17T01:00:00+05:30")).open,
    true,
  );
  assert.equal(
    openingState(shop, new Date("2026-11-17T03:00:00+05:30")).open,
    false,
  );
  assert.equal(
    openingState(shop, new Date("2026-11-17T09:00:00+05:30")).open,
    true,
  );
  assert.equal(
    openingState(
      { ...shop, temporarilyClosed: true },
      new Date("2026-11-17T10:00:00+05:30"),
    ).open,
    false,
  );
});
