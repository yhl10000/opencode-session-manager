import { useEffect, useLayoutEffect, useState } from "react";
import type { UiMessage } from "../i18n/messages";

export type Theme = "light" | "dark" | "system";
export const THEME_KEY = "opencode-session-manager.theme";

function readTheme(): { theme: Theme; warning: UiMessage | null } {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return {
      theme: stored === "light" || stored === "system" ? stored : "dark",
      warning: null,
    };
  } catch (error) {
    return {
      theme: "dark",
      warning: { key: "themeRead", detail: error instanceof Error ? error.message : undefined },
    };
  }
}

export function useTheme() {
  const [initial] = useState(readTheme);
  const [theme, updateTheme] = useState(initial.theme);
  const [warning, setWarning] = useState(initial.warning);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true,
  );
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const changed = () => setSystemDark(media.matches);
    changed();
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset["theme"] =
      theme === "system" ? (systemDark ? "dark" : "light") : theme;
  }, [theme, systemDark]);
  function setTheme(next: Theme) {
    updateTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
      setWarning(null);
    } catch (error) {
      setWarning({
        key: "themeSave",
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  }
  return { theme, setTheme, warning };
}
