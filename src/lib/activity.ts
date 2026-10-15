export const RECENT_ACTIVITY_MS = 72 * 60 * 60 * 1000;

export function isRecentlyActive(updatedAt: number, now: number): boolean {
  return Number.isFinite(updatedAt) && updatedAt <= now && now - updatedAt < RECENT_ACTIVITY_MS;
}
