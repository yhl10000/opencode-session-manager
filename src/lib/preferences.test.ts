import { expect, it } from "vitest";
import { readPreferences, savePreferences } from "./preferences";

it("retains old view settings while defaulting new fields", () => {
  localStorage.setItem(
    "opencode-session-manager.preferences",
    JSON.stringify({ sort: "name", collapsed: ["a"] }),
  );

  const result = readPreferences();

  expect(result.warning).toBeNull();
  expect(result.value).toEqual({
    sort: "name",
    collapsed: ["a"],
    showChildSessions: false,
    pinnedSessionIds: [],
  });
});

it("persists child visibility and multiple pins without replacing existing settings", () => {
  const preferences = {
    ...readPreferences().value,
    showChildSessions: true,
    pinnedSessionIds: ["ses_a", "ses_b", "ses_c"],
  };

  savePreferences(preferences);

  expect(readPreferences().value).toEqual(preferences);
});
