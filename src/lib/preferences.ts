import { z } from "zod";
import type { UiMessage } from "../i18n/messages";

const KEY = "opencode-session-manager.preferences";
const schema = z
  .object({
    sort: z.enum(["activity", "name"]),
    collapsed: z.array(z.string()).max(10000).readonly(),
    showChildSessions: z.boolean().default(false),
    pinnedSessionIds: z.array(z.string()).max(10000).readonly().default([]),
  })
  .readonly();
export type Preferences = z.infer<typeof schema>;
const defaults: Preferences = {
  sort: "activity",
  collapsed: [],
  showChildSessions: false,
  pinnedSessionIds: [],
};

export function readPreferences(): {
  readonly value: Preferences;
  readonly warning: UiMessage | null;
} {
  try {
    const stored = localStorage.getItem(KEY);
    if (!stored) return { value: defaults, warning: null };
    const parsed = schema.safeParse(JSON.parse(stored));
    return parsed.success
      ? { value: parsed.data, warning: null }
      : { value: defaults, warning: { key: "settingsReset" } };
  } catch (error) {
    return {
      value: defaults,
      warning: { key: "settingsRead", detail: error instanceof Error ? error.message : undefined },
    };
  }
}

export function savePreferences(preferences: Preferences): UiMessage | null {
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences));
    return null;
  } catch (error) {
    return { key: "settingsSave", detail: error instanceof Error ? error.message : undefined };
  }
}
