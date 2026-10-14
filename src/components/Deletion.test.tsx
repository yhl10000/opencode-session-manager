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

it("returns keyboard focus to confirmation when an outside control receives focus", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Delete session Fix routing" }));
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

  screen.getByRole("searchbox").focus();

  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
});
