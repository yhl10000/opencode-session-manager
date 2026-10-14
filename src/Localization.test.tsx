import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { LocaleProvider, Message } from "./i18n/locale";
import { errorMessage } from "./lib/api";
import { localTime, relativeTime } from "./lib/format";

afterEach(() => vi.restoreAllMocks());

it("uses Simplified Chinese when the system language is Chinese", () => {
  vi.spyOn(navigator, "language", "get").mockReturnValue("zh-TW");
  render(<App />);
  expect(screen.getByRole("heading", { name: "需要桌面应用" })).toBeInTheDocument();
  expect(document.documentElement.lang).toBe("zh-CN");
});

it("uses English for non-Chinese system locales", () => {
  vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
  render(<App />);
  expect(screen.getByRole("heading", { name: "Desktop app required" })).toBeInTheDocument();
  expect(document.documentElement.lang).toBe("en");
});

it("switches immediately and persists independently from view settings", () => {
  vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
  const view = JSON.stringify({ sort: "name", collapsed: ["a"] });
  localStorage.setItem("opencode-session-manager.preferences", view);
  render(<App />);
  fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
    target: { value: "zh-CN" },
  });
  expect(screen.getByRole("heading", { name: "需要桌面应用" })).toBeInTheDocument();
  expect(document.title).toBe("OpenCode 会话管理器");
  expect(localStorage.getItem("opencode-session-manager.locale")).toBe("zh-CN");
  expect(localStorage.getItem("opencode-session-manager.preferences")).toBe(view);
});

it("honors a saved English override on a Chinese system", () => {
  vi.spyOn(navigator, "language", "get").mockReturnValue("zh-CN");
  localStorage.setItem("opencode-session-manager.locale", "en");
  render(<App />);
  expect(screen.getByRole("heading", { name: "Desktop app required" })).toBeInTheDocument();
});

it("ignores an invalid saved locale and follows the system", () => {
  vi.spyOn(navigator, "language", "get").mockReturnValue("zh-HK");
  localStorage.setItem("opencode-session-manager.locale", "invalid");
  render(<App />);
  expect(screen.getByRole("combobox", { name: "语言" })).toHaveValue("zh-CN");
});

it.each(["en", "zh-CN"] as const)(
  "formats dates and relative time with selected locale %s",
  (locale) => {
    vi.spyOn(Date, "now").mockReturnValue(1800000000000);
    const timestamp = 1800000000000 - 7200000;
    expect(relativeTime(timestamp, locale)).toBe(locale === "en" ? "2 hours ago" : "2小时前");
    expect(localTime(timestamp, locale)).toBe(
      new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
        timestamp,
      ),
    );
  },
);

it("localizes known native error explanations without changing diagnostic details", () => {
  localStorage.setItem("opencode-session-manager.locale", "zh-CN");
  const detail = "Session rename failed: PATCH /session/ses_a: HTTP 500";
  render(
    <LocaleProvider>
      <Message message={errorMessage(detail)} />
    </LocaleProvider>,
  );
  expect(screen.getByText(/无法重命名会话/)).toBeInTheDocument();
  expect(screen.getByText(detail)).toBeInTheDocument();
});

it("reports blocked language persistence while switching this window", () => {
  render(<App />);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage denied");
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
    target: { value: "zh-CN" },
  });
  expect(screen.getByRole("heading", { name: "需要桌面应用" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("无法保存设置");
  expect(screen.getByRole("status")).toHaveTextContent("Storage denied");
});

it("restores the saved choice after a failed write and saves after storage recovers", () => {
  localStorage.setItem("opencode-session-manager.locale", "en");
  const view = render(<App />);
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage denied");
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
    target: { value: "zh-CN" },
  });
  view.unmount();
  write.mockRestore();
  render(<App />);
  expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("en");
  fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
    target: { value: "zh-CN" },
  });
  expect(localStorage.getItem("opencode-session-manager.locale")).toBe("zh-CN");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
