import { AlertCircle, CheckCircle2, Database, RefreshCw, Terminal, X } from "lucide-react";
import { useCallback, useState } from "react";
import { DeleteDialog } from "./components/DeleteDialog";
import { DetailPanel } from "./components/DetailPanel";
import { Explorer } from "./components/Explorer";
import { type MenuPosition, SessionMenu } from "./components/SessionMenu";
import { StatePanel } from "./components/StatePanel";
import { useActions } from "./hooks/useActions";
import { useCatalog } from "./hooks/useCatalog";
import { useDeletion } from "./hooks/useDeletion";

export function App() {
  const { desktop, catalog, loading, error, refresh, replaceCatalog } = useCatalog();
  const deletion = useDeletion(replaceCatalog);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const actions = useActions();
  const selected = catalog?.sessions.find((session) => session.id === selectedId);
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <Terminal aria-hidden="true" />
          <strong>OpenCode</strong>
          <span className="header-divider" />
          <span>Session Manager</span>
        </div>
        <div className="header-actions">
          <span className="local-label">
            <Database aria-hidden="true" />
            Local workspace
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Refresh sessions"
            title="Refresh sessions"
            disabled={!desktop || loading}
            onClick={() => void refresh()}
          >
            <RefreshCw aria-hidden="true" />
          </button>
        </div>
      </header>
      <main className="workspace">
        {!desktop ? (
          <StatePanel kind="desktop" title="Desktop app required">
            Open the Windows desktop app to browse your local OpenCode database. This browser cannot
            access sessions or launch Windows Terminal.
          </StatePanel>
        ) : catalog ? (
          <>
            <Explorer
              catalog={catalog}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
              onLaunch={(id) => void actions.perform(id, "tab")}
              onMenu={setMenu}
              onDelete={deletion.ask}
              deleting={deletion.pending}
            />
            {selected ? (
              <DetailPanel
                session={selected}
                projectName={
                  catalog.projects.find((project) => project.id === selected.projectId)?.name ??
                  "Project unavailable"
                }
                pending={actions.pending !== null}
                onAction={(id, action) => void actions.perform(id, action)}
              />
            ) : (
              <section className="detail">
                <header className="detail-toolbar">Session details</header>
                <StatePanel
                  title={
                    catalog.sessions.length === 0 ? "No sessions yet" : "Pick up where you left off"
                  }
                  action={
                    catalog.sessions.length === 0 ? (
                      <button type="button" onClick={() => void refresh()}>
                        Refresh sessions
                      </button>
                    ) : undefined
                  }
                >
                  {catalog.sessions.length === 0
                    ? "Create a session in OpenCode, then refresh this workspace."
                    : "Select a session from any project to inspect its details and read-only preview. Open it when you are ready to continue."}
                </StatePanel>
              </section>
            )}
          </>
        ) : loading ? (
          <StatePanel title="Reading local sessions">
            Loading project and session metadata from your OpenCode database...
          </StatePanel>
        ) : (
          <StatePanel
            kind="error"
            title="Sessions could not load"
            action={
              <button type="button" onClick={() => void refresh()}>
                Retry loading
              </button>
            }
          >
            {error ?? "Refresh to try reading the local database again."}
          </StatePanel>
        )}
      </main>
      {catalog && error && (
        <div className="refresh-error" role="alert">
          <AlertCircle aria-hidden="true" />
          <span>Refresh failed. Showing the previous catalog. {error}</span>
          <button type="button" disabled={loading} onClick={() => void refresh()}>
            Retry refresh
          </button>
        </div>
      )}
      {actions.notice && (
        <div
          className={`notice ${actions.notice.error ? "error" : ""}`}
          role={actions.notice.error ? "alert" : "status"}
        >
          {actions.notice.error ? (
            <AlertCircle aria-hidden="true" />
          ) : (
            <CheckCircle2 aria-hidden="true" />
          )}
          <span>{actions.notice.text}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={actions.dismiss}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      )}
      <footer className="status-bar">
        <span>
          <Database aria-hidden="true" />
          {loading
            ? "Reading database..."
            : desktop
              ? "Local database"
              : "Desktop connection unavailable"}
        </span>
        <span className="database-path mono" title={catalog?.databasePath}>
          {catalog?.databasePath}
        </span>
        <span>
          {catalog
            ? `${catalog.projects.length} projects / ${catalog.sessions.length} sessions`
            : "Local data stays on this device"}
        </span>
        <span>OpenCode {catalog?.opencodeVersion || "version unavailable"}</span>
      </footer>
      {menu && (
        <SessionMenu
          position={menu}
          onClose={closeMenu}
          disabled={actions.pending !== null}
          onAction={(id, action) => void actions.perform(id, action)}
        />
      )}
      {deletion.request && (
        <DeleteDialog
          request={deletion.request}
          pending={deletion.pending}
          error={deletion.error}
          onCancel={deletion.cancel}
          onConfirm={() => void deletion.confirm()}
        />
      )}
    </div>
  );
}
