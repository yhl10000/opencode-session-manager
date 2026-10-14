import { ListCollapse, ListTree, Search, X } from "lucide-react";
import type { useExplorerView } from "../hooks/useExplorerView";
import { Message, useLocale } from "../i18n/locale";
import type { Catalog } from "../lib/types";

type Props = {
  readonly catalog: Catalog;
  readonly view: ReturnType<typeof useExplorerView>;
};

export function ExplorerToolbar({ catalog, view }: Props) {
  const { t, number } = useLocale();
  const { preferences, warning, query, setQuery, groups, update, count } = view;
  return (
    <div className="explorer-toolbar">
      <div className="pane-title">
        <h2>{t("sessions")}</h2>
        <span className="count">{number(count)}</span>
        <button
          type="button"
          className="icon-button"
          aria-label={t("collapseAll")}
          title={t(query.trim() ? "clearToCollapse" : "collapseAll")}
          disabled={Boolean(query.trim()) || groups.length === 0}
          onClick={() =>
            update({ ...preferences, collapsed: catalog.projects.map((project) => project.id) })
          }
        >
          <ListCollapse aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={t("expandAll")}
          title={t("expandAll")}
          disabled={Boolean(query.trim()) || groups.length === 0}
          onClick={() => update({ ...preferences, collapsed: [] })}
        >
          <ListTree aria-hidden="true" />
        </button>
      </div>
      <label className="search-label" htmlFor="session-search">
        {t("searchLabel")}
      </label>
      <div className="search-field">
        <Search aria-hidden="true" />
        <input
          id="session-search"
          type="search"
          placeholder={t("searchPlaceholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button
            type="button"
            className="icon-button"
            aria-label={t("clearSearch")}
            onClick={() => setQuery("")}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="sort-line">
        <span>
          {t(query.trim() ? "matches" : "projects", {
            count: number(query.trim() ? count : groups.length),
          })}
        </span>
        <label>
          {t("sortBy")}{" "}
          <select
            aria-label={t("sortProjects")}
            value={preferences.sort}
            onChange={(event) => {
              const sort = event.target.value;
              if (sort === "activity" || sort === "name") update({ ...preferences, sort });
            }}
          >
            <option value="activity">{t("latestActivity")}</option>
            <option value="name">{t("projectName")}</option>
          </select>
        </label>
      </div>
      <label className="child-toggle">
        <input
          type="checkbox"
          checked={preferences.showChildSessions}
          onChange={(event) => update({ ...preferences, showChildSessions: event.target.checked })}
        />
        {t("showChildren")}
      </label>
      {warning && (
        <p className="inline-warning" role="status">
          <Message message={warning} />
        </p>
      )}
    </div>
  );
}
