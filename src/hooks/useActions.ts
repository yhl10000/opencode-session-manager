import { useRef, useState } from "react";
import { api, errorMessage } from "../lib/api";
import type { LaunchMode } from "../lib/types";

export type SessionAction = LaunchMode | "copy" | "directory";
export type Notice = { readonly text: string; readonly error: boolean };

export function useActions() {
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const busy = useRef(false);
  async function perform(sessionId: string, action: SessionAction) {
    if (busy.current) return;
    busy.current = true;
    setPending(sessionId);
    setNotice(null);
    try {
      switch (action) {
        case "tab":
        case "window": {
          const receipt = await api.launchSession(sessionId, action);
          setNotice({
            text: `Launch request dispatched: ${receipt}. Check Windows Terminal; session resume is not confirmed.`,
            error: false,
          });
          break;
        }
        case "copy":
          await navigator.clipboard.writeText(sessionId);
          setNotice({ text: "Session ID copied to clipboard.", error: false });
          break;
        case "directory":
          await api.openDirectory(sessionId);
          setNotice({ text: "Directory open request sent to Windows Explorer.", error: false });
          break;
      }
    } catch (error) {
      setNotice({ text: errorMessage(error), error: true });
    } finally {
      busy.current = false;
      setPending(null);
    }
  }
  return { pending, notice, perform, dismiss: () => setNotice(null) };
}
