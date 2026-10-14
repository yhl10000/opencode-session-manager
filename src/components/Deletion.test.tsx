import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { App } from "../App";
import { catalog, session } from "../test/fixtures";

const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>();
beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation(async (command) => {
    if (command === "get_catalog") return catalog;
    if (command === "delete_sessions")
      return {
        catalog: { ...catalog, projects: [catalog.projects[0]], sessions: [catalog.sessions[1]] },
        deletedIds: ["ses_a"],
        errors: [],
      };
    throw new Error("Unexpected command");
  });
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: { invoke: (command: string, args: Record<string, unknown>) => invoke(command, args) },
  });
});

it("cancels session deletion without calling native delete", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Delete session Fix routing" }));

  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(invoke.mock.calls.filter(([command]) => command === "delete_sessions")).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Select Fix routing" })).toBeInTheDocument();
});

it("deletes only the confirmed session and removes its final empty group", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Delete session Fix routing" }));
  expect(invoke.mock.calls.filter(([command]) => command === "delete_sessions")).toHaveLength(0);

  fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));

  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("delete_sessions", { sessionIds: ["ses_a"] }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("region", { name: "Alpha" })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("button", { name: "Select Build parser" })).toBeInTheDocument();
});

it("confirms all directory sessions including unloaded and filtered sessions", async () => {
  const sessions = Array.from({ length: 45 }, (_, i) =>
    session({ id: `ses_a${i}`, title: i === 0 ? "Matching" : "Other", updatedAt: i }),
  );
  invoke.mockResolvedValue({ ...catalog, sessions });
  render(<App />);
  await screen.findByRole("button", { name: "Delete project Alpha" });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Matching" } });
  fireEvent.click(screen.getByRole("button", { name: "Delete project Alpha" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("45 sessions");
  invoke.mockResolvedValue({
    catalog: { ...catalog, projects: [], sessions: [] },
    deletedIds: sessions.map((s) => s.id),
    errors: [],
  });

  fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));

  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("delete_sessions", {
      sessionIds: sessions.map((s) => s.id),
    }),
  );
});

it("reports deletion failure without hiding the session", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Delete session Fix routing" }));
  invoke.mockRejectedValue(new Error("Deletion refused: child sessions"));

  fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("child sessions");
  expect(screen.getByRole("button", { name: "Select Fix routing" })).toBeInTheDocument();
});

it("discloses hidden children and includes them in a filtered project deletion", async () => {
  const sessions = [session(), session({ id: "child", title: "Hidden child", parentId: "ses_a" })];
  invoke.mockResolvedValue({ ...catalog, sessions });
  render(<App />);
  await screen.findByRole("button", { name: "Select Fix routing" });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Fix routing" } });

  fireEvent.click(screen.getByRole("button", { name: "Delete project Alpha" }));

  expect(screen.getByRole("dialog")).toHaveTextContent("2 sessions");
  expect(screen.getByRole("dialog")).toHaveTextContent("1 hidden child sessions");
  invoke.mockResolvedValue({
    catalog: { ...catalog, projects: [], sessions: [] },
    deletedIds: ["ses_a", "child"],
    errors: [],
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith("delete_sessions", { sessionIds: ["ses_a", "child"] }),
  );
});

it("returns keyboard focus to confirmation when an outside control receives focus", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Delete session Fix routing" }));
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

  screen.getByRole("searchbox").focus();

  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
});

it("discloses children hidden by search even when child visibility is enabled", async () => {
  localStorage.setItem(
    "opencode-session-manager.preferences",
    JSON.stringify({ sort: "activity", collapsed: [], showChildSessions: true }),
  );
  invoke.mockResolvedValue({
    ...catalog,
    sessions: [session(), session({ id: "child", title: "Other", parentId: "ses_a" })],
  });
  render(<App />);
  await screen.findByRole("button", { name: "Select Fix routing" });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Fix routing" } });

  fireEvent.click(screen.getByRole("button", { name: "Delete project Alpha" }));

  expect(screen.getByRole("dialog")).toHaveTextContent("1 hidden child sessions");
});

it("clears a deleted selection rather than restoring it when a later catalog contains the ID", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Select Fix routing" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete session Fix routing" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Select Fix routing" })).not.toBeInTheDocument(),
  );
  invoke.mockResolvedValue(catalog);

  fireEvent.click(screen.getByRole("button", { name: "Refresh sessions" }));

  expect(await screen.findByRole("button", { name: "Select Fix routing" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
