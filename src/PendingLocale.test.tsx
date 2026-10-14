import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { App } from "./App";
import type { Catalog } from "./lib/types";
import { catalog } from "./test/fixtures";

it.each(["success", "failure"] as const)(
  "renders a pending launch %s in the latest language",
  async (outcome) => {
    let finish: ((value: string) => void) | undefined;
    let fail: ((error: Error) => void) | undefined;
    const receipt = new Promise<string>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
    const invoke = vi.fn(async (command: string) =>
      command === "get_catalog" ? catalog : receipt,
    );
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: { invoke } });
    render(<App />);
    fireEvent.doubleClick(await screen.findByRole("button", { name: "Select Fix routing" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "zh-CN" },
    });
    await act(async () => {
      if (outcome === "success") finish?.("ses_a / PID 42");
      else fail?.(new Error("Required executable not found: wt"));
    });
    if (outcome === "success")
      expect(screen.getByRole("status")).toHaveTextContent("启动请求已发送：ses_a / PID 42");
    else {
      expect(screen.getByRole("alert")).toHaveTextContent("缺少所需的可执行程序");
      expect(screen.getByRole("alert")).toHaveTextContent("Required executable not found: wt");
    }
    expect(invoke.mock.calls.filter(([command]) => command === "get_catalog")).toHaveLength(1);
  },
);

it("keeps a pending rename and its user input when the locale changes", async () => {
  let finish: ((value: Catalog) => void) | undefined;
  const response = new Promise<Catalog>((resolve) => {
    finish = resolve;
  });
  const invoke = vi.fn(async (command: string) => (command === "get_catalog" ? catalog : response));
  Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: { invoke } });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Actions for Fix routing" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Rename session" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Session title" }), {
    target: { value: "用户 Rename" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save title" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
    target: { value: "zh-CN" },
  });
  expect(screen.getByRole("button", { name: "正在保存..." })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "会话标题" })).toHaveValue("用户 Rename");
  await act(async () =>
    finish?.({
      ...catalog,
      sessions: catalog.sessions.map((item) =>
        item.id === "ses_a" ? { ...item, title: "用户 Rename" } : item,
      ),
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "选择 用户 Rename" })).toBeInTheDocument();
  expect(invoke.mock.calls.filter(([command]) => command === "rename_session")).toHaveLength(1);
});
