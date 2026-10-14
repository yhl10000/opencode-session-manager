import { type Locale, translate } from "../i18n/locale";

export function relativeTime(timestamp: number, locale: Locale = "en"): string {
  const minutes = Math.round((timestamp - Date.now()) / 60000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  if (Math.abs(minutes) < 1440) return formatter.format(Math.round(minutes / 60), "hour");
  return formatter.format(Math.round(minutes / 1440), "day");
}

export function localTime(timestamp: number, locale: Locale = "en"): string {
  return new Date(timestamp).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

export function available(value: string | number | null, locale: Locale = "en"): string {
  return value === null || value === "" ? translate(locale, "unavailable") : String(value);
}
