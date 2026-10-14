import { beforeEach, expect, it, vi } from "vitest";
import { catalog } from "../test/fixtures";
import { api, isDesktop } from "./api";

const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>();
beforeEach(() => {
  invoke.mockReset();
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: { invoke: (command: string, args: Record<string, unknown>) => invoke(command, args) },
  });
});
it("parses metadata without retrieving detail when catalog loads", async () => {
  invoke.mockResolvedValue(catalog);
  const result = await api.getCatalog();
  expect(result.sessions).toHaveLength(2);
  expect(invoke).toHaveBeenCalledExactlyOnceWith("get_catalog", {});
});
it("rejects malformed native responses", async () => {
  invoke.mockResolvedValue({ projects: [] });
  await expect(api.getCatalog()).rejects.toThrow();
});
it.each(["tab", "window"] as const)("dispatches exact launch mode %s", async (mode) => {
  invoke.mockResolvedValue("dispatched");
  await api.launchSession("ses_a", mode);
  expect(invoke).toHaveBeenCalledWith("launch_session", { sessionId: "ses_a", mode });
});
it("recognizes a plain browser as desktop unavailable", () => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  expect(isDesktop()).toBe(false);
});

it("renames through the exact IPC contract and validates the returned catalog", async () => {
  invoke.mockResolvedValue(catalog);

  expect(await api.renameSession("ses_a", "Renamed")).toEqual(catalog);
  expect(invoke).toHaveBeenCalledWith("rename_session", { sessionId: "ses_a", title: "Renamed" });
});

it("rejects a malformed rename response instead of applying it", async () => {
  invoke.mockResolvedValue({ sessions: [] });

  await expect(api.renameSession("ses_a", "Renamed")).rejects.toThrow();
});
