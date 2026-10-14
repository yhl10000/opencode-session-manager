import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { App } from "../App";
import { catalog, session } from "../test/fixtures";

const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>();
beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation(async (command) => {
    if (command === "get_catalog") return catalog;
    if (command === "get_session_detail")
      return { session: session(), preview: [], previewTruncated: false };
    if (command === "rename_session")
      return { ...catalog, sessions: [session({ title: "New title" })] };
    throw new Error(`Unexpected command ${command}`);
  });
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: { invoke: (command: string, args: Record<string, unknown>) => invoke(command, args) },
  });
});

async function openRename() {
  fireEvent.click(await screen.findByRole("button", { name: "Actions for Fix routing" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Rename session" }));
  return screen.getByRole("dialog", { name: "Rename session" });
}

it("seeds the title, rejects whitespace, trims submission and refreshes selected detail", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Select Fix routing" }));
  await screen.findByRole("heading", { name: "Fix routing" });
  const dialog = await openRename();
  const title = within(dialog).getByRole("textbox", { name: "Session title" });
  expect(title).toHaveValue("Fix routing");
  expect(title).toHaveFocus();
  fireEvent.change(title, { target: { value: "   " } });
  expect(within(dialog).getByRole("button", { name: "Save title" })).toBeDisabled();
  fireEvent.change(title, { target: { value: "  New title  " } });
  invoke.mockImplementation(async (command) => {
    if (command === "rename_session")
      return { ...catalog, sessions: [session({ title: "New title" })] };
    return { session: session({ title: "New title" }), preview: [], previewTruncated: false };
  });

  fireEvent.click(within(dialog).getByRole("button", { name: "Save title" }));

  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("rename_session", {
      sessionId: "ses_a",
      title: "New title",
    }),
  );
  expect(await screen.findByRole("button", { name: "Select New title" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await screen.findByRole("heading", { name: "New title" })).toBeInTheDocument();
  expect(invoke.mock.calls.filter(([command]) => command === "get_session_detail")).toHaveLength(2);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("keeps failed rename editable with original catalog and allows retry", async () => {
  render(<App />);
  const dialog = await openRename();
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "New title" } });
  invoke.mockRejectedValueOnce(new Error("Rename refused"));

  fireEvent.click(within(dialog).getByRole("button", { name: "Save title" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Rename refused");
  expect(screen.getByRole("button", { name: "Select Fix routing" })).toBeInTheDocument();
  expect(within(dialog).getByRole("textbox")).toHaveValue("New title");
  fireEvent.click(within(dialog).getByRole("button", { name: "Save title" }));
  await screen.findByRole("button", { name: "Select New title" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("blocks duplicate submit and dismissal while rename is pending", async () => {
  render(<App />);
  const dialog = await openRename();
  let finish: ((value: unknown) => void) | undefined;
  invoke.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Save title" }));

  expect(within(dialog).getByRole("button", { name: "Saving..." })).toBeDisabled();
  expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
  fireEvent.keyDown(dialog, { key: "Escape" });
  fireEvent.submit(within(dialog).getByRole("textbox").closest("form") ?? dialog);
  expect(invoke.mock.calls.filter(([command]) => command === "rename_session")).toHaveLength(1);
  await act(async () => finish?.(catalog));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("clears selected child details when child visibility is turned off", async () => {
  localStorage.setItem(
    "opencode-session-manager.preferences",
    JSON.stringify({ sort: "activity", collapsed: [], showChildSessions: true }),
  );
  const child = session({ parentId: "parent", title: "Child session" });
  invoke.mockImplementation(async (command) =>
    command === "get_catalog"
      ? { ...catalog, sessions: [child] }
      : { session: child, preview: [], previewTruncated: false },
  );
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Select Child session" }));
  await screen.findByRole("heading", { name: "Child session" });

  fireEvent.click(screen.getByRole("checkbox", { name: "Show child sessions" }));

  expect(screen.queryByRole("heading", { name: "Child session" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Alpha" })).not.toBeInTheDocument();
  expect(screen.getByText("0 projects / 0 sessions")).toBeInTheDocument();
});

it("discards pre-rename detail responses and keeps the new title when refresh fails", async () => {
  let finishOld: ((value: unknown) => void) | undefined;
  invoke.mockImplementation(async (command) => {
    if (command === "get_catalog") return catalog;
    if (command === "get_session_detail")
      return new Promise((resolve) => {
        finishOld = resolve;
      });
    return { ...catalog, sessions: [session({ title: "New title" })] };
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Select Fix routing" }));
  const dialog = await openRename();
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "New title" } });
  invoke.mockImplementation(async (command) => {
    if (command === "rename_session")
      return { ...catalog, sessions: [session({ title: "New title" })] };
    throw new Error("Detail refresh unavailable");
  });

  fireEvent.click(within(dialog).getByRole("button", { name: "Save title" }));
  await screen.findByText("Detail refresh unavailable");
  await act(async () => finishOld?.({ session: session(), preview: [], previewTruncated: false }));

  expect(screen.getByRole("heading", { name: "New title" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Fix routing" })).not.toBeInTheDocument();
});

it("returns focus and traps keyboard focus when rename is cancelled", async () => {
  render(<App />);
  const dialog = await openRename();
  const title = within(dialog).getByRole("textbox");
  fireEvent.keyDown(title, { key: "Tab", shiftKey: true });
  expect(within(dialog).getByRole("button", { name: "Save title" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement ?? dialog, { key: "Tab" });
  expect(title).toHaveFocus();

  fireEvent.keyDown(dialog, { key: "Escape" });

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Actions for Fix routing" })).toHaveFocus();
  expect(invoke.mock.calls.filter(([command]) => command === "rename_session")).toHaveLength(0);
});
