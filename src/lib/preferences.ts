import { z } from "zod";

const KEY = "opencode-session-manager.preferences";
const schema = z
  .object({ sort: z.enum(["activity", "name"]), collapsed: z.array(z.string()).max(10000) })
  .readonly();
export type Preferences = z.infer<typeof schema>;
const defaults: Preferences = { sort: "activity", collapsed: [] };

export function readPreferences(): {
  readonly value: Preferences;
  readonly warning: string | null;
} {
  try {
    const stored = localStorage.getItem(KEY);
    if (!stored) return { value: defaults, warning: null };
    const parsed = schema.safeParse(JSON.parse(stored));
    return parsed.success
      ? { value: parsed.data, warning: null }
      : { value: defaults, warning: "Saved view settings were invalid and have been reset." };
  } catch (error) {
    return {
      value: defaults,
      warning:
        error instanceof Error
          ? `View settings could not be read: ${error.message}`
          : "View settings could not be read.",
    };
  }
}

export function savePreferences(preferences: Preferences): string | null {
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences));
    return null;
  } catch (error) {
    return error instanceof Error
      ? `View settings could not be saved: ${error.message}`
      : "View settings could not be saved.";
  }
}
