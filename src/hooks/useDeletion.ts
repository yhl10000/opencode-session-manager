import { useRef, useState } from "react";
import type { DeleteRequest } from "../components/DeleteDialog";
import { api, errorMessage } from "../lib/api";
import type { Catalog } from "../lib/types";

export function useDeletion(replaceCatalog: (catalog: Catalog) => void) {
  const [request, setRequest] = useState<DeleteRequest | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  function ask(next: DeleteRequest) {
    if (!busy.current) {
      setRequest(next);
      setError(null);
    }
  }
  function cancel() {
    if (!busy.current) {
      setRequest(null);
      setError(null);
    }
  }
  async function confirm() {
    if (!request || busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await api.deleteSessions(request.ids);
      replaceCatalog(result.catalog);
      if (result.errors.length > 0) {
        const remaining = request.ids.filter((id) =>
          result.catalog.sessions.some((session) => session.id === id),
        );
        setRequest({ ...request, ids: remaining });
        setError(result.errors.join("\n"));
      } else {
        setRequest(null);
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return { request, pending, error, ask, cancel, confirm };
}
