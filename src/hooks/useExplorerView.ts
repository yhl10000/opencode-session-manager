import { useMemo, useState } from "react";
import { buildGroups } from "../lib/catalog";
import { type Preferences, readPreferences, savePreferences } from "../lib/preferences";
import type { Catalog } from "../lib/types";

export function useExplorerView(catalog: Catalog) {
  const [saved] = useState(readPreferences);
  const [preferences, setPreferences] = useState(saved.value);
  const [warning, setWarning] = useState(saved.warning);
  const [query, setQuery] = useState("");
  const groups = useMemo(
    () => buildGroups(catalog, { ...preferences, query }),
    [catalog, preferences, query],
  );
  function update(next: Preferences) {
    setPreferences(next);
    setWarning(savePreferences(next));
  }
  function togglePin(id: string) {
    update({
      ...preferences,
      pinnedSessionIds: preferences.pinnedSessionIds.includes(id)
        ? preferences.pinnedSessionIds.filter((pinned) => pinned !== id)
        : [...preferences.pinnedSessionIds, id],
    });
  }
  return {
    preferences,
    warning,
    query,
    setQuery,
    groups,
    update,
    togglePin,
    count: groups.reduce((total, group) => total + group.sessions.length, 0),
  };
}
