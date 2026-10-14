import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, isDesktop } from "../lib/api";
import type { Catalog } from "../lib/types";

export function useCatalog() {
  const desktop = isDesktop();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(desktop);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!desktop) return;
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getCatalog();
      if (request === generation.current) setCatalog(data);
    } catch (failure) {
      if (request === generation.current) setError(errorMessage(failure));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [desktop]);
  useEffect(() => {
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);
  const replaceCatalog = useCallback((data: Catalog) => {
    generation.current++;
    setCatalog(data);
    setLoading(false);
    setError(null);
  }, []);
  return { desktop, catalog, loading, error, refresh, replaceCatalog };
}
