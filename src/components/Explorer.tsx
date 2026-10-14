import { ChevronDown, ChevronRight, Folder, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useExplorerView } from "../hooks/useExplorerView";
import { isExpanded, loadMore, PAGE_SIZE } from "../lib/catalog";
import type { Catalog } from "../lib/types";
import type { DeleteRequest } from "./DeleteDialog";
import { ExplorerToolbar } from "./ExplorerToolbar";
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
  readonly onHideChildren?: () => void;
  readonly onCountsChange?: (counts: {
    readonly projects: number;
    readonly sessions: number;
  }) => void;
};
export function Explorer({
  catalog,
  selectedId,
  onSelect,
  onLaunch,
  onMenu,
  onDelete,
  deleting,
  onHideChildren,
  onCountsChange,
}: Props) {
  const view = useExplorerView(catalog);
  const { preferences, query, setQuery, groups, update, togglePin, count } = view;
  const [pages, setPages] = useState<Readonly<Record<string, number>>>({});
  useEffect(() => {
    onCountsChange?.({ projects: groups.length, sessions: count });
  }, [onCountsChange, groups.length, count]);
  useEffect(() => {
    if (!preferences.showChildSessions) onHideChildren?.();
  }, [preferences.showChildSessions, onHideChildren]);
  return (
    <aside className="explorer" aria-label="Project and session explorer">
      <ExplorerToolbar catalog={catalog} view={view} />
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
                        hiddenChildCount: catalog.sessions.filter(
                          (session) =>
                            session.projectId === project.id &&
                            session.parentId !== null &&
                            (!expanded ||
                              !sessions.slice(0, visible).some((item) => item.id === session.id)),
                        ).length,
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
                      pinned={preferences.pinnedSessionIds.includes(session.id)}
                      onTogglePin={togglePin}
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
