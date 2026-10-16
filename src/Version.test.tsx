import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { version } from "../package.json";
import { App } from "./App";
import { catalog } from "./test/fixtures";

it.each(["en", "zh-CN"])("shows the manager build version without desktop in %s", (locale) => {
  localStorage.setItem("opencode-session-manager.locale", locale);

  render(<App />);

  expect(within(screen.getByRole("banner")).getByText(`v${version}`)).toBeVisible();
});

it.each(["en", "zh-CN"])("keeps manager version on database failure in %s", async (locale) => {
  localStorage.setItem("opencode-session-manager.locale", locale);
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: { invoke: vi.fn().mockRejectedValue(new Error("Database unavailable")) },
  });

  render(<App />);

  await screen.findByRole("alert");
  expect(within(screen.getByRole("banner")).getByText(`v${version}`)).toBeVisible();
  expect(screen.getByRole("contentinfo")).toHaveTextContent("OpenCode CLI");
});

it.each(["en", "zh-CN"])("distinguishes manager and CLI versions in %s", async (locale) => {
  localStorage.setItem("opencode-session-manager.locale", locale);
  const cliVersion = "9.8.7";
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: { invoke: vi.fn().mockResolvedValue({ ...catalog, opencodeVersion: cliVersion }) },
  });

  render(<App />);

  expect(await screen.findByText(`OpenCode CLI ${cliVersion}`)).toBeVisible();
  const badge = screen.getByText(`v${version}`);
  expect(badge.closest(".app-header")).toBeInTheDocument();
  expect(badge).toHaveAttribute(
    "title",
    locale === "en" ? `Session Manager version ${version}` : `会话管理器版本 ${version}`,
  );
  expect(badge.closest(".app-header")).not.toHaveTextContent(cliVersion);
});
