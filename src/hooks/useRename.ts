import { useRef, useState } from "react";
import type { UiMessage } from "../i18n/messages";
import { api, errorMessage } from "../lib/api";
import type { Catalog, SessionSummary } from "../lib/types";

export function useRename(replaceCatalog: (catalog: Catalog) => void) {
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<UiMessage | null>(null);
  const [revision, setRevision] = useState(0);
  const busy = useRef(false);
  function ask(next: SessionSummary) {
    if (busy.current) return;
    setSession(next);
    setError(null);
  }
  function cancel() {
    if (!busy.current) setSession(null);
  }
  async function confirm(title: string) {
    const trimmed = title.trim();
    if (!session || busy.current || !trimmed) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await api.renameSession(session.id, trimmed);
      replaceCatalog(result);
      setRevision((current) => current + 1);
      setSession(null);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return { session, pending, error, revision, ask, cancel, confirm };
}
