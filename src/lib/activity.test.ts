import { expect, it } from "vitest";
import { isRecentlyActive, RECENT_ACTIVITY_MS } from "./activity";

it("uses a rolling 72-hour window with an exclusive expiration boundary", () => {
  const now = 1800000000000;
  expect(isRecentlyActive(now, now)).toBe(true);
  expect(isRecentlyActive(now - RECENT_ACTIVITY_MS + 1, now)).toBe(true);
  expect(isRecentlyActive(now - RECENT_ACTIVITY_MS, now)).toBe(false);
  expect(isRecentlyActive(now - RECENT_ACTIVITY_MS - 1, now)).toBe(false);
  expect(isRecentlyActive(now + 1, now)).toBe(false);
  expect(isRecentlyActive(Number.NaN, now)).toBe(false);
});
