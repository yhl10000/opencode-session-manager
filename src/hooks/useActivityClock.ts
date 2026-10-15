import { useEffect, useState } from "react";
import { RECENT_ACTIVITY_MS } from "../lib/activity";
import type { SessionSummary } from "../lib/types";

export function useActivityClock(sessions: readonly SessionSummary[]): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const current = Math.max(now, Date.now());
    let delay = 60000;
    for (const session of sessions) {
      const boundary =
        session.updatedAt > current ? session.updatedAt : session.updatedAt + RECENT_ACTIVITY_MS;
      if (boundary > current) delay = Math.min(delay, boundary - current);
    }
    const refresh = () => setNow(Date.now());
    const timer = window.setTimeout(refresh, Math.max(1, delay));
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [sessions, now]);
  return now;
}
