import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { english, type MessageKey, type UiMessage } from "./messages";
import { chinese } from "./zh-CN";

export type Locale = "en" | "zh-CN";
export const LOCALE_KEY = "opencode-session-manager.locale";
export function systemLocale(language: string): Locale {
  return /^zh(?:-|$)/i.test(language) ? "zh-CN" : "en";
}
export function translate(
  locale: Locale,
  key: MessageKey,
  values: UiMessage["values"] = {},
): string {
  const template = (locale === "zh-CN" ? chinese : english)[key];
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    values[name] === undefined ? placeholder : String(values[name]),
  );
}
function readLocale(): { readonly locale: Locale; readonly warning: UiMessage | null } {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    return {
      locale: stored === "en" || stored === "zh-CN" ? stored : systemLocale(navigator.language),
      warning: null,
    };
  } catch (error) {
    return {
      locale: systemLocale(navigator.language),
      warning: { key: "localeRead", detail: error instanceof Error ? error.message : undefined },
    };
  }
}
function localeTools(locale: Locale) {
  return {
    locale,
    t: (key: MessageKey, values?: UiMessage["values"]) => translate(locale, key, values),
    number: (value: number) => new Intl.NumberFormat(locale).format(value),
    compact: (value: number) =>
      new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(
        value,
      ),
  };
}
type LocaleContextValue = ReturnType<typeof localeTools> & {
  readonly setLocale: (locale: Locale) => void;
  readonly warning: UiMessage | null;
};
const LocaleContext = createContext<LocaleContextValue>({
  ...localeTools("en"),
  setLocale: () => undefined,
  warning: null,
});
export function LocaleProvider({ children }: { readonly children: ReactNode }) {
  const [initial] = useState(readLocale);
  const [locale, updateLocale] = useState(initial.locale);
  const [warning, setWarning] = useState(initial.warning);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(locale, "appTitle");
  }, [locale]);
  const value = useMemo<LocaleContextValue>(
    () => ({
      ...localeTools(locale),
      warning,
      setLocale(next) {
        updateLocale(next);
        try {
          localStorage.setItem(LOCALE_KEY, next);
          setWarning(null);
        } catch (error) {
          setWarning({
            key: "localeSave",
            detail:
              error instanceof Error || error instanceof DOMException ? error.message : undefined,
          });
        }
      },
    }),
    [locale, warning],
  );
  return <LocaleContext value={value}>{children}</LocaleContext>;
}
export function useLocale() {
  return useContext(LocaleContext);
}
export function Message({ message }: { readonly message: UiMessage }) {
  const { t } = useLocale();
  return (
    <>
      {t(message.key, message.values)}
      {message.detail && (
        <>
          {" "}
          <span className="technical-detail">{message.detail}</span>
        </>
      )}
    </>
  );
}
