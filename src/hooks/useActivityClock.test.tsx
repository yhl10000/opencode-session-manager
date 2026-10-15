import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { isRecentlyActive, RECENT_ACTIVITY_MS } from "../lib/activity";
import { session } from "../test/fixtures";
import { useActivityClock } from "./useActivityClock";

afterEach(() => vi.useRealTimers());

it("expires an active row at the boundary without refreshing the catalog", () => {
  vi.useFakeTimers();
  vi.setSystemTime(1800000000000);
  const updatedAt = Date.now() - RECENT_ACTIVITY_MS + 500;
  const sessions = [session({ updatedAt })];
  const view = renderHook(() => useActivityClock(sessions));
  expect(isRecentlyActive(updatedAt, view.result.current)).toBe(true);
  act(() => vi.advanceTimersByTime(500));
  expect(isRecentlyActive(updatedAt, view.result.current)).toBe(false);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("rechecks after focus when time has advanced during sleep", () => {
  vi.useFakeTimers();
  vi.setSystemTime(1800000000000);
  const updatedAt = Date.now();
  const sessions = [session({ updatedAt })];
  const view = renderHook(() => useActivityClock(sessions));
  vi.setSystemTime(updatedAt + RECENT_ACTIVITY_MS);
  act(() => window.dispatchEvent(new Event("focus")));
  expect(isRecentlyActive(updatedAt, view.result.current)).toBe(false);
});
