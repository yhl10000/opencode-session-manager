import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
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
  async getSessionDetail(sessionId: string) {
    return detailSchema.parse(await invoke<unknown>("get_session_detail", { sessionId }));
  },
  async launchSession(sessionId: string, mode: LaunchMode) {
    return z.string().parse(await invoke<unknown>("launch_session", { sessionId, mode }));
  },
  async openDirectory(sessionId: string): Promise<void> {
    await invoke("open_directory", { sessionId });
  },
};

export function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError)
    return "The desktop returned an invalid response. Refresh or restart the app.";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "The desktop request failed. Try again.";
}
