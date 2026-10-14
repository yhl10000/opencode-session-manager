import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { MessageKey, UiMessage } from "../i18n/messages";
import { catalogSchema, deleteResultSchema, detailSchema, type LaunchMode } from "./types";

export function isDesktop(): boolean {
  return "__TAURI_INTERNALS__" in window;
}
export const api = {
  async getCatalog() {
    return catalogSchema.parse(await invoke<unknown>("get_catalog"));
  },
  async deleteSessions(sessionIds: readonly string[]) {
    return deleteResultSchema.parse(await invoke<unknown>("delete_sessions", { sessionIds }));
  },
  async renameSession(sessionId: string, title: string) {
    return catalogSchema.parse(await invoke<unknown>("rename_session", { sessionId, title }));
  },
  async getSessionDetail(sessionId: string) {
    return detailSchema.parse(await invoke<unknown>("get_session_detail", { sessionId }));
  },
  async launchSession(sessionId: string, mode: LaunchMode) {
    const receipt = z.string().parse(await invoke<unknown>("launch_session", { sessionId, mode }));
    const nativeReceipt = receipt.match(
      /^Dispatched Windows Terminal launch request for (\S+) \(dispatcher PID (\d+)\)\. Session loading and TUI readiness are not confirmed\.$/,
    );
    return nativeReceipt ? `${nativeReceipt[1]} / PID ${nativeReceipt[2]}` : receipt;
  },
  async openDirectory(sessionId: string): Promise<void> {
    await invoke("open_directory", { sessionId });
  },
};

const nativeErrors: readonly (readonly [string, MessageKey])[] = [
  ["Cannot read OpenCode database (unsupported schema or unavailable file):", "databaseError"],
  ["Cannot execute native command:", "commandError"],
  ["Required executable not found:", "executableError"],
  ["Unsupported PowerShell executable path containing ';':", "powershellPathError"],
  ["OpenCode discovery failed:", "discoveryError"],
  ["Session is not present in the OpenCode database:", "missingSessionError"],
  ["Invalid session ID:", "invalidSessionError"],
  ["Session directory does not exist:", "directoryError"],
  ["Deletion refused:", "deletionError"],
  ["Deletion stopped", "deletionError"],
  ["Session rename failed:", "renameError"],
  ["Application is closing; session mutations are no longer accepted", "closingError"],
  ["Mutation state is unavailable. Restart the app.", "mutationError"],
];
export function errorMessage(error: unknown): UiMessage {
  if (error instanceof z.ZodError) return { key: "invalidResponse", detail: error.message };
  const detail = error instanceof Error ? error.message : typeof error === "string" ? error : null;
  if (detail !== null)
    return {
      key: nativeErrors.find(([prefix]) => detail.startsWith(prefix))?.[1] ?? "actionError",
      detail,
    };
  return { key: "requestFailed" };
}
