import {
  ChevronDown,
  ChevronRight,
  Folder,
  ListCollapse,
  ListTree,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { buildGroups, isExpanded, loadMore, PAGE_SIZE } from "../lib/catalog";
import { type Preferences, readPreferences, savePreferences } from "../lib/preferences";
import type { Catalog } from "../lib/types";
import type { DeleteRequest } from "./DeleteDialog";
import type { MenuPosition } from "./SessionMenu";
import { SessionRow } from "./SessionRow";
import { StatePanel } from "./StatePanel";

type Props = {
  readonly catalog: Catalog;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onLaunch: (id: string) => void;
  readonly onMenu: (position: MenuPosition) => void;
  readonly onDelete?: (request: DeleteRequest) => void;
  readonly deleting?: boolean;
};
export function Explorer({
  catalog,
  selectedId,
  onSelect,
  onLaunch,
  onMenu,
  onDelete,
  deleting,
}: Props) {
  const [saved] = useState(readPreferences);
  const [preferences, setPreferences] = useState(saved.value);
  const [warning, setWarning] = useState(saved.warning);
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState<Readonly<Record<string, number>>>({});
  const groups = useMemo(
    () => buildGroups(catalog, preferences.sort, query),
    [catalog, preferences.sort, query],
  );
  const count = groups.reduce((total, group) => total + group.sessions.length, 0);
  function update(next: Preferences) {
    setPreferences(next);
    setWarning(savePreferences(next));
  }
  return (
    <aside className="explorer" aria-label="Project and session explorer">
      <div className="explorer-toolbar">
        <div className="pane-title">
          <h2>Sessions</h2>
          <span className="count">{catalog.sessions.length.toLocaleString()}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Collapse all projects"
            title={query.trim() ? "Clear search to collapse all projects" : "Collapse all projects"}
            disabled={Boolean(query.trim()) || catalog.projects.length === 0}
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
            disabled={Boolean(query.trim()) || catalog.projects.length === 0}
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
          <span>{query.trim() ? `${count} matches` : `${catalog.projects.length} projects`}</span>
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
        {warning && (
          <p className="inline-warning" role="status">
            {warning}
          </p>
        )}
      </div>
      <div className="explorer-scroll">
        {groups.map(({ project, sessions }) => {
          const expanded = isExpanded(project.id, preferences.collapsed, query);
          const visible = pages[project.id] ?? PAGE_SIZE;
          const remaining = Math.max(0, sessions.length - visible);
          return (
            <section className="project-group" key={project.id} aria-label={project.name}>
              <div className="project-heading">
                <button
                  type="button"
                  className="project-header"
                  aria-expanded={expanded}
                  aria-controls={`group-${project.id}`}
                  disabled={Boolean(query.trim())}
                  onClick={() =>
                    update({
                      ...preferences,
                      collapsed: expanded
                        ? [...preferences.collapsed, project.id]
                        : preferences.collapsed.filter((id) => id !== project.id),
                    })
                  }
                >
                  {expanded ? (
                    <ChevronDown aria-hidden="true" />
                  ) : (
                    <ChevronRight aria-hidden="true" />
                  )}
                  <Folder aria-hidden="true" />
                  <span className="project-label">
                    <strong title={project.name}>{project.name || "Unnamed project"}</strong>
                    <span className="mono" title={project.path}>
                      {project.path || "Path unavailable"}
                    </span>
                  </span>
                  <span className="count">{sessions.length}</span>
                </button>
                {onDelete && (
                  <button
                    type="button"
                    className="icon-button row-delete"
                    aria-label={`Delete project ${project.name}`}
                    title="Delete all project sessions"
                    disabled={deleting}
                    onClick={() =>
                      onDelete({
                        label: project.name,
                        path: project.path,
                        ids: catalog.sessions
                          .filter((session) => session.projectId === project.id)
                          .map((session) => session.id),
                      })
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                )}
              </div>
              {expanded && (
                <div id={`group-${project.id}`} className="project-sessions">
                  {sessions.slice(0, visible).map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      selected={session.id === selectedId}
                      onSelect={onSelect}
                      onLaunch={onLaunch}
                      onMenu={onMenu}
                      deleting={deleting}
                      onDelete={
                        onDelete
                          ? () =>
                              onDelete({
                                label: session.title,
                                path: session.directory,
                                ids: [session.id],
                              })
                          : undefined
                      }
                    />
                  ))}
                  {sessions.length === 0 && (
                    <p className="group-empty">No sessions in this project.</p>
                  )}
                  {remaining > 0 && (
                    <button
                      type="button"
                      className="load-more"
                      onClick={() => setPages((current) => loadMore(current, project.id))}
                    >
                      Load {Math.min(PAGE_SIZE, remaining)} more <span>{remaining} remaining</span>
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}
        {groups.length === 0 && (
          <StatePanel
            kind="search"
            title="No matching sessions"
            action={
              <button type="button" onClick={() => setQuery("")}>
                Clear search
              </button>
            }
          >
            Try another title, project, ID, path or model.
          </StatePanel>
        )}
      </div>
      <div className="explorer-hint">
        Double-click to open in a tab <span>Right-click for actions</span>
      </div>
    </aside>
  );
}
