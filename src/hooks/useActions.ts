import { useRef, useState } from "react";
import type { UiMessage } from "../i18n/messages";
import { api, errorMessage } from "../lib/api";
import type { LaunchMode } from "../lib/types";

export type SessionAction = LaunchMode | "copy" | "directory";
export type Notice = { readonly message: UiMessage; readonly error: boolean };

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
            message: { key: "launchReceipt", values: { receipt } },
            error: false,
          });
          break;
        }
        case "copy":
          await navigator.clipboard.writeText(sessionId);
          setNotice({ message: { key: "copied" }, error: false });
          break;
        case "directory":
          await api.openDirectory(sessionId);
          setNotice({ message: { key: "directorySent" }, error: false });
          break;
      }
    } catch (error) {
      setNotice({ message: errorMessage(error), error: true });
    } finally {
      busy.current = false;
      setPending(null);
    }
  }
  return { pending, notice, perform, dismiss: () => setNotice(null) };
}
