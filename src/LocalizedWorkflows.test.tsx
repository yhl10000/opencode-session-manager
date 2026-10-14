import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { catalog, session } from "./test/fixtures";

afterEach(() => vi.restoreAllMocks());
const languages = [
  {
    locale: "en",
    select: "Select Fix routing",
    pin: "Pin session Fix routing",
    actions: "Actions for Fix routing",
    rename: "Rename session",
    title: "Session title",
    save: "Save title",
    delete: "Delete session Renamed 用户标题",
    cancel: "Cancel",
    confirm: "Confirm deletion",
    tab: "Open in tab",
    window: "Open in window",
    copy: "Copy session ID",
    directory: "Open directory",
    refresh: "Refresh sessions",
    retry: "Retry preview",
    copied: "Session ID copied to clipboard.",
    renameError: "The session could not be renamed.",
    deletionError: "Deletion could not complete.",
  },
  {
    locale: "zh-CN",
    select: "选择 Fix routing",
    pin: "固定会话 Fix routing",
    actions: "Fix routing 的操作",
    rename: "重命名会话",
    title: "会话标题",
    save: "保存标题",
    delete: "删除会话 Renamed 用户标题",
    cancel: "取消",
    confirm: "确认删除",
    tab: "在标签页中打开",
    window: "在新窗口中打开",
    copy: "复制会话 ID",
    directory: "打开目录",
    refresh: "刷新会话",
    retry: "重试预览",
    copied: "会话 ID 已复制到剪贴板。",
    renameError: "无法重命名会话",
    deletionError: "删除未能完成",
  },
] as const;

it.each(languages)("keeps critical workflows and destructive safety in $locale", async (labels) => {
  localStorage.setItem("opencode-session-manager.locale", labels.locale);
  let current = catalog;
  let failure: string | null = null;
  const invoke = vi.fn(async (command: string, args: Record<string, unknown>) => {
    if (command === failure)
      throw new Error(
        command === "rename_session"
          ? "Session rename failed: HTTP 500"
          : "Deletion refused: child sessions",
      );
    switch (command) {
      case "get_catalog":
        return current;
      case "get_session_detail":
        return {
          session: current.sessions.find((item) => item.id === args["sessionId"]),
          preview: [
            { id: "m1", role: "user", text: "Original <script>用户内容</script>", createdAt: 2 },
          ],
          previewTruncated: true,
        };
      case "rename_session":
        current = {
          ...current,
          sessions: current.sessions.map((item) =>
            item.id === args["sessionId"] ? { ...item, title: String(args["title"]) } : item,
          ),
        };
        return current;
      case "delete_sessions":
        current = { ...current, sessions: current.sessions.filter((item) => item.id !== "ses_a") };
        return { catalog: current, deletedIds: ["ses_a"], errors: [] };
      case "launch_session":
        return "Dispatched Windows Terminal launch request for ses_a (dispatcher PID 123). Session loading and TUI readiness are not confirmed.";
      case "open_directory":
        return undefined;
      default:
        throw new Error(`Unexpected test command ${command}`);
    }
  });
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: { invoke: (command: string, args: Record<string, unknown>) => invoke(command, args) },
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: labels.select }));
  expect(await screen.findByText("Original <script>用户内容</script>")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Fix routing" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: labels.pin }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Fix routing" } });
  expect(screen.queryByRole("button", { name: /Build parser/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
  for (const [label, mode] of [
    [labels.tab, "tab"],
    [labels.window, "window"],
  ] as const) {
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("launch_session", { sessionId: "ses_a", mode }),
    );
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("ses_a / PID 123"));
  }
  fireEvent.click(screen.getByRole("button", { name: labels.copy }));
  expect(await screen.findByText(labels.copied)).toBeInTheDocument();
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith("ses_a");
  fireEvent.click(screen.getByRole("button", { name: labels.directory }));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("open_directory", { sessionId: "ses_a" }),
  );
  fireEvent.click(screen.getByRole("button", { name: labels.actions }));
  fireEvent.click(screen.getByRole("menuitem", { name: labels.rename }));
  fireEvent.change(screen.getByRole("textbox", { name: labels.title }), { target: { value: " " } });
  expect(screen.getByRole("button", { name: labels.save })).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: labels.title }), {
    target: { value: "  Renamed 用户标题  " },
  });
  failure = "rename_session";
  fireEvent.click(screen.getByRole("button", { name: labels.save }));
  expect(await screen.findByRole("alert")).toHaveTextContent(labels.renameError);
  expect(screen.getByRole("alert")).toHaveTextContent("HTTP 500");
  failure = null;
  fireEvent.click(screen.getByRole("button", { name: labels.save }));
  await screen.findByRole("heading", { name: "Renamed 用户标题" });
  fireEvent.click(screen.getByRole("button", { name: labels.delete }));
  expect(screen.getByRole("button", { name: labels.cancel })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: labels.cancel }));
  expect(invoke.mock.calls.filter(([command]) => command === "delete_sessions")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: labels.delete }));
  failure = "delete_sessions";
  fireEvent.click(screen.getByRole("button", { name: labels.confirm }));
  expect(await screen.findByRole("alert")).toHaveTextContent(labels.deletionError);
  expect(screen.getByRole("alert")).toHaveTextContent("child sessions");
  failure = null;
  fireEvent.click(screen.getByRole("button", { name: labels.confirm }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(invoke).toHaveBeenCalledWith("delete_sessions", { sessionIds: ["ses_a"] });
  expect(screen.queryByRole("button", { name: labels.delete })).not.toBeInTheDocument();
  expect(localStorage.getItem("opencode-session-manager.locale")).toBe(labels.locale);
});

it("switches a selected view and completed notice without refetching or resetting filters and pins", async () => {
  const invoke = vi.fn(async (command: string) => {
    if (command === "get_catalog") return catalog;
    if (command === "get_session_detail")
      return { session: session(), preview: [], previewTruncated: false };
    return "receipt";
  });
  Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: { invoke } });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Select Fix routing" }));
  await screen.findByText("No text preview");
  fireEvent.click(screen.getByRole("button", { name: "Pin session Fix routing" }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Fix routing" } });
  fireEvent.click(screen.getByRole("button", { name: "Open in tab" }));
  await screen.findByText(/Launch request dispatched/);
  const calls = invoke.mock.calls.length;
  fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
    target: { value: "zh-CN" },
  });
  expect(screen.getByRole("status")).toHaveTextContent("启动请求已发送");
  expect(screen.getByRole("button", { name: "选择 Fix routing" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "取消固定会话 Fix routing" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("searchbox")).toHaveValue("Fix routing");
  expect(invoke.mock.calls).toHaveLength(calls);
  fireEvent.click(screen.getByRole("button", { name: "取消固定会话 Fix routing" }));
  expect(localStorage.getItem("opencode-session-manager.locale")).toBe("zh-CN");
});
