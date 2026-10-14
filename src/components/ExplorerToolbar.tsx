import { ListCollapse, ListTree, Search, X } from "lucide-react";
import type { useExplorerView } from "../hooks/useExplorerView";
import type { Catalog } from "../lib/types";

type Props = {
  readonly catalog: Catalog;
  readonly view: ReturnType<typeof useExplorerView>;
};

export function ExplorerToolbar({ catalog, view }: Props) {
  const { preferences, warning, query, setQuery, groups, update, count } = view;
  return (
    <div className="explorer-toolbar">
      <div className="pane-title">
        <h2>Sessions</h2>
        <span className="count">{count.toLocaleString()}</span>
        <button
          type="button"
          className="icon-button"
          aria-label="Collapse all projects"
          title={query.trim() ? "Clear search to collapse all projects" : "Collapse all projects"}
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
          aria-label="Expand all projects"
          title="Expand all projects"
          disabled={Boolean(query.trim()) || groups.length === 0}
          onClick={() => update({ ...preferences, collapsed: [] })}
        >
          <ListTree aria-hidden="true" />
        </button>
      </div>
      <label className="search-label" htmlFor="session-search">
        Search all projects and sessions
      </label>
      <div className="search-field">
        <Search aria-hidden="true" />
        <input
          id="session-search"
          type="search"
          placeholder="Title, project, ID, path or model"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button
            type="button"
            className="icon-button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="sort-line">
        <span>{query.trim() ? `${count} matches` : `${groups.length} projects`}</span>
        <label>
          Sort by{" "}
          <select
            aria-label="Sort projects"
            value={preferences.sort}
            onChange={(event) => {
              const sort = event.target.value;
              if (sort === "activity" || sort === "name") update({ ...preferences, sort });
            }}
          >
            <option value="activity">Latest activity</option>
            <option value="name">Project name</option>
          </select>
        </label>
      </div>
      <label className="child-toggle">
        <input
          type="checkbox"
          checked={preferences.showChildSessions}
          onChange={(event) => update({ ...preferences, showChildSessions: event.target.checked })}
        />
        Show child sessions
      </label>
      {warning && (
        <p className="inline-warning" role="status">
          {warning}
        </p>
      )}
    </div>
  );
}
