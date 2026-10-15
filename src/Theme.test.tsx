import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { THEME_KEY } from "./hooks/useTheme";
import { catalog, session } from "./test/fixtures";

afterEach(() => vi.restoreAllMocks());

it("defaults to dark and restores a saved light theme independently from language", () => {
  const view = render(<App />);
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), {
    target: { value: "light" },
  });
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  expect(localStorage.getItem(THEME_KEY)).toBe("light");
  view.unmount();
  localStorage.setItem("opencode-session-manager.locale", "zh-CN");
  render(<App />);
  expect(screen.getByRole("combobox", { name: "主题" })).toHaveValue("light");
  expect(screen.getByRole("option", { name: "跟随系统" })).toBeInTheDocument();
});

it("reacts to system changes only when system theme is selected and removes its listener", () => {
  let listener: (() => void) | undefined;
  const media = {
    matches: false,
    addEventListener: vi.fn((_event: string, callback: () => void) => {
      listener = callback;
    }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("matchMedia", () => media);
  const view = render(<App />);
  fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), {
    target: { value: "system" },
  });
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  act(() => {
    media.matches = true;
    listener?.();
  });
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), {
    target: { value: "light" },
  });
  act(() => listener?.());
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  view.unmount();
  expect(media.removeEventListener).toHaveBeenCalledWith("change", listener);
  vi.unstubAllGlobals();
});

it("switches without refetching or losing selection, pins, search or rename input", async () => {
  const invoke = vi.fn(async (command: string) =>
    command === "get_catalog"
      ? catalog
      : { session: session(), preview: [], previewTruncated: false },
  );
  Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: { invoke } });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Select Fix routing" }));
  await screen.findByText("No text preview");
  fireEvent.click(screen.getByRole("button", { name: "Pin session Fix routing" }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Fix routing" } });
  const calls = invoke.mock.calls.length;
  fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), {
    target: { value: "light" },
  });
  expect(screen.getByRole("button", { name: "Select Fix routing" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "Unpin session Fix routing" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("searchbox")).toHaveValue("Fix routing");
  expect(invoke).toHaveBeenCalledTimes(calls);
  fireEvent.click(screen.getByRole("button", { name: "Actions for Fix routing" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Rename session" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Session title" }), {
    target: { value: "Keep 用户标题" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), {
    target: { value: "dark" },
  });
  expect(screen.getByRole("textbox", { name: "Session title" })).toHaveValue("Keep 用户标题");
});

it("reports failed theme persistence but still switches the current window", () => {
  render(<App />);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage denied");
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), {
    target: { value: "light" },
  });
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  expect(screen.getByRole("status")).toHaveTextContent("could not be saved");
});
