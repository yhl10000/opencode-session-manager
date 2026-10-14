import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import type { SessionDetail } from "./lib/types";
import { catalog, session } from "./test/fixtures";

const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>();
beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation(async (command, args) => {
    switch (command) {
      case "get_catalog":
        return catalog;
      case "get_session_detail":
        return {
          session: session({ id: String(args?.["sessionId"]) }),
          preview: [{ id: "m1", role: "user", text: "Preview content", createdAt: 2 }],
          previewTruncated: false,
        };
      case "launch_session":
        return "dispatch-123";
      case "open_directory":
        return undefined;
      default:
        throw new Error(`Unexpected test command: ${command}`);
    }
  });
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: { invoke: (command: string, args: Record<string, unknown>) => invoke(command, args) },
  });
});

it("requires desktop without displaying fixtures in a browser", async () => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  render(<App />);
  expect(screen.getByText("Desktop app required")).toBeInTheDocument();
  expect(invoke).not.toHaveBeenCalled();
});
it("loads preview only when a session is selected", async () => {
  render(<App />);
  const row = await screen.findByRole("button", { name: /Select Fix routing/ });
  expect(invoke.mock.calls.filter(([command]) => command === "get_session_detail")).toHaveLength(0);
  await userEvent.click(row);
  expect(await screen.findByText("Preview content")).toBeInTheDocument();
  expect(invoke).toHaveBeenCalledWith("get_session_detail", { sessionId: "ses_a" });
});
it("discards older detail when selections resolve out of order", async () => {
  let resolveOld: ((value: SessionDetail) => void) | undefined;
  invoke.mockImplementation(async (command, args) => {
    if (command === "get_catalog") return catalog;
    if (args?.["sessionId"] === "ses_a")
      return new Promise<SessionDetail>((resolve) => {
        resolveOld = resolve;
      });
    return {
      session: session({ id: "ses_b", title: "Build parser" }),
      preview: [{ id: "new", role: "assistant", text: "New preview", createdAt: 2 }],
      previewTruncated: false,
    };
  });
  render(<App />);
  await userEvent.click(await screen.findByRole("button", { name: /Select Fix routing/ }));
  await userEvent.click(screen.getByRole("button", { name: /Select Build parser/ }));
  await screen.findByText("New preview");
  await act(async () => {
    resolveOld?.({
      session: session(),
      preview: [{ id: "old", role: "user", text: "Old preview", createdAt: 1 }],
      previewTruncated: false,
    });
  });
  expect(screen.queryByText("Old preview")).not.toBeInTheDocument();
});
it("dispatches tab and window separately with honest receipt", async () => {
  render(<App />);
  await userEvent.click(await screen.findByRole("button", { name: /Select Fix routing/ }));
  await userEvent.click(screen.getByRole("button", { name: "Open in tab" }));
  expect(await screen.findByText(/Launch request dispatched/)).toBeInTheDocument();
  expect(invoke).toHaveBeenCalledWith("launch_session", { sessionId: "ses_a", mode: "tab" });
  await userEvent.click(screen.getByRole("button", { name: "Open in window" }));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("launch_session", { sessionId: "ses_a", mode: "window" }),
  );
});
it("supports keyboard context menu and directory action", async () => {
  render(<App />);
  const row = await screen.findByRole("button", { name: /Select Fix routing/ });
  row.focus();
  fireEvent.keyDown(row, { key: "F10", shiftKey: true });
  await userEvent.click(screen.getByRole("menuitem", { name: "Open directory" }));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("open_directory", { sessionId: "ses_a" }),
  );
});
it("keeps per-project pagination through search and sort changes", async () => {
  invoke.mockResolvedValue({
    ...catalog,
    sessions: Array.from({ length: 45 }, (_, index) =>
      session({ id: `a${index}`, title: `Alpha ${index}`, updatedAt: index }),
    ),
  });
  render(<App />);
  await userEvent.click(await screen.findByRole("button", { name: /Load 20 more/ }));
  expect(screen.getAllByRole("button", { name: /Select Alpha/ })).toHaveLength(40);
  await userEvent.type(screen.getByRole("searchbox"), "missing");
  await userEvent.clear(screen.getByRole("searchbox"));
  expect(screen.getAllByRole("button", { name: /Select Alpha/ })).toHaveLength(40);
});

it("retries failed lazy preview without replacing catalog", async () => {
  invoke.mockImplementation(async (command) => {
    if (command === "get_catalog") return catalog;
    throw new Error("Preview read failed");
  });
  render(<App />);
  await userEvent.click(await screen.findByRole("button", { name: /Select Fix routing/ }));
  await screen.findByText("Preview read failed");
  invoke.mockResolvedValue({ session: session(), preview: [], previewTruncated: false });
  await userEvent.click(screen.getByRole("button", { name: "Retry preview" }));
  expect(await screen.findByText("No text preview")).toBeInTheDocument();
});

it("reports clipboard failure without claiming success", async () => {
  render(<App />);
  await userEvent.click(await screen.findByRole("button", { name: /Select Fix routing/ }));
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("Clipboard permission denied")) },
  });
  fireEvent.click(screen.getByRole("button", { name: "Copy session ID" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Clipboard permission denied");
  expect(screen.queryByText("Session ID copied to clipboard.")).not.toBeInTheDocument();
});

it("dispatches a tab when a session is double-clicked", async () => {
  render(<App />);
  fireEvent.doubleClick(await screen.findByRole("button", { name: /Select Fix routing/ }));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("launch_session", { sessionId: "ses_a", mode: "tab" }),
  );
});

it("reports failed launch without confirming resume", async () => {
  render(<App />);
  await userEvent.click(await screen.findByRole("button", { name: /Select Fix routing/ }));
  await screen.findByText("Preview content");
  invoke.mockRejectedValue(new Error("Windows Terminal unavailable"));
  await userEvent.click(screen.getByRole("button", { name: "Open in tab" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Windows Terminal unavailable");
  expect(screen.queryByText(/Launch request dispatched/)).not.toBeInTheDocument();
});

it("keeps loaded rows after failed refresh", async () => {
  render(<App />);
  await screen.findByRole("button", { name: /Select Fix routing/ });
  invoke.mockRejectedValue(new Error("Database unavailable"));
  await userEvent.click(screen.getByRole("button", { name: "Refresh sessions" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Showing the previous catalog");
  expect(screen.getByRole("button", { name: /Select Fix routing/ })).toBeInTheDocument();
});

it("restores invoking row focus when context menu closes with Escape", async () => {
  render(<App />);
  const row = await screen.findByRole("button", { name: /Select Fix routing/ });
  row.focus();
  fireEvent.keyDown(row, { key: "F10", shiftKey: true });
  expect(screen.getByRole("menuitem", { name: "Open in tab" })).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(row).toHaveFocus();
});

it("refreshes selected session metadata without resetting project pagination", async () => {
  const sessions = Array.from({ length: 45 }, (_, index) =>
    session({ id: `a${index}`, title: `Alpha ${index}`, updatedAt: index }),
  );
  invoke.mockImplementation(async (command, args) => {
    if (command === "get_catalog") return { ...catalog, sessions };
    return {
      session: session({ id: String(args?.["sessionId"]), title: "Original metadata" }),
      preview: [],
      previewTruncated: false,
    };
  });
  render(<App />);
  await userEvent.click(await screen.findByRole("button", { name: /Load 20 more/ }));
  await userEvent.click(screen.getByRole("button", { name: "Select Alpha 44" }));
  await screen.findByRole("heading", { name: "Original metadata" });
  invoke.mockResolvedValue({
    session: session({ id: "a44", title: "Refreshed metadata", tokens: 42000 }),
    preview: [],
    previewTruncated: false,
  });

  await userEvent.click(screen.getByRole("button", { name: "Refresh session metadata" }));

  expect(await screen.findByRole("heading", { name: "Refreshed metadata" })).toBeInTheDocument();
  expect(invoke.mock.calls.filter(([command]) => command === "get_session_detail")).toEqual([
    ["get_session_detail", { sessionId: "a44" }],
    ["get_session_detail", { sessionId: "a44" }],
  ]);
  expect(screen.getByRole("button", { name: "Select Alpha 44" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getAllByRole("button", { name: /Select Alpha/ })).toHaveLength(40);
  expect(invoke.mock.calls.filter(([command]) => command === "get_catalog")).toHaveLength(1);
});
