import { AlertCircle, CheckCircle2, Database, RefreshCw, Terminal, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DeleteDialog } from "./components/DeleteDialog";
import { DetailPanel } from "./components/DetailPanel";
import { Explorer } from "./components/Explorer";
import { RenameDialog } from "./components/RenameDialog";
import { type MenuPosition, SessionMenu } from "./components/SessionMenu";
import { StatePanel } from "./components/StatePanel";
import { useActions } from "./hooks/useActions";
import { useCatalog } from "./hooks/useCatalog";
import { useDeletion } from "./hooks/useDeletion";
import { useRename } from "./hooks/useRename";
import { useTheme } from "./hooks/useTheme";
import { LocaleProvider, Message, useLocale } from "./i18n/locale";

export function App() {
  return (
    <LocaleProvider>
      <Workspace />
    </LocaleProvider>
  );
}
function Workspace() {
  const { t, number, locale, setLocale, warning } = useLocale();
  const theme = useTheme();
  const { desktop, catalog, loading, error, refresh, replaceCatalog } = useCatalog();
  const deletion = useDeletion(replaceCatalog);
  const rename = useRename(replaceCatalog);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const [counts, setCounts] = useState({ projects: 0, sessions: 0 });
  const closeMenu = useCallback(() => setMenu(null), []);
  const actions = useActions();
  const selected = catalog?.sessions.find((session) => session.id === selectedId);
  useEffect(() => {
    if (catalog && selectedId !== null && !selected) setSelectedId(null);
  }, [catalog, selectedId, selected]);
  const hideChildren = useCallback(() => {
    if (selected?.parentId != null) setSelectedId(null);
  }, [selected]);
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <Terminal aria-hidden="true" />
          <strong>OpenCode</strong>
          <span className="header-divider" />
          <span>{t("manager")}</span>
        </div>
        <div className="header-actions">
          <label className="theme-selector">
            <span>{t("theme")}</span>
            <select
              value={theme.theme}
              onChange={(event) => {
                const next = event.target.value;
                if (next === "light" || next === "dark" || next === "system") theme.setTheme(next);
              }}
            >
              <option value="light">{t("themeLight")}</option>
              <option value="dark">{t("themeDark")}</option>
              <option value="system">{t("themeSystem")}</option>
            </select>
          </label>
          <label className="language-selector">
            <span>{t("language")}</span>
            <select
              value={locale}
              onChange={(event) => {
                const next = event.target.value;
                if (next === "en" || next === "zh-CN") setLocale(next);
              }}
            >
              <option value="zh-CN" lang="zh-CN">
                简体中文
              </option>
              <option value="en" lang="en">
                English
              </option>
            </select>
          </label>
          <span className="local-label">
            <Database aria-hidden="true" />
            {t("localWorkspace")}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label={t("refreshSessions")}
            title={t("refreshSessions")}
            disabled={!desktop || loading}
            onClick={() => void refresh()}
          >
            <RefreshCw aria-hidden="true" />
          </button>
        </div>
      </header>
      <main className="workspace">
        {!desktop ? (
          <StatePanel kind="desktop" title={t("desktopRequired")}>
            {t("desktopExplanation")}
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
              onHideChildren={hideChildren}
              onCountsChange={setCounts}
            />
            {selected ? (
              <DetailPanel
                key={`${selected.id}:${rename.revision}`}
                session={selected}
                projectName={
                  catalog.projects.find((project) => project.id === selected.projectId)?.name ??
                  t("projectUnavailable")
                }
                pending={actions.pending !== null}
                onAction={(id, action) => void actions.perform(id, action)}
              />
            ) : (
              <section className="detail">
                <header className="detail-toolbar">{t("details")}</header>
                <StatePanel
                  title={catalog.sessions.length === 0 ? t("noSessions") : t("pickSession")}
                  action={
                    catalog.sessions.length === 0 ? (
                      <button type="button" onClick={() => void refresh()}>
                        {t("refreshSessions")}
                      </button>
                    ) : undefined
                  }
                >
                  {catalog.sessions.length === 0 ? t("createSession") : t("selectExplanation")}
                </StatePanel>
              </section>
            )}
          </>
        ) : loading ? (
          <StatePanel title={t("readingSessions")}>{t("loadingCatalog")}</StatePanel>
        ) : (
          <StatePanel
            kind="error"
            title={t("loadFailed")}
            action={
              <button type="button" onClick={() => void refresh()}>
                {t("retryLoading")}
              </button>
            }
          >
            {error ? <Message message={error} /> : t("refreshDatabase")}
          </StatePanel>
        )}
      </main>
      {catalog && error && (
        <div className="refresh-error" role="alert">
          <AlertCircle aria-hidden="true" />
          <span>
            {t("refreshFailed")} <Message message={error} />
          </span>
          <button type="button" disabled={loading} onClick={() => void refresh()}>
            {t("retryRefresh")}
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
          <span>
            <Message message={actions.notice.message} />
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label={t("dismiss")}
            onClick={actions.dismiss}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      )}
      {warning && (
        <div className="refresh-error" role="status">
          <Message message={warning} />
        </div>
      )}
      {theme.warning && (
        <div className="refresh-error" role="status">
          <Message message={theme.warning} />
        </div>
      )}
      <footer className="status-bar">
        <span>
          <Database aria-hidden="true" />
          {loading ? t("readingDatabase") : desktop ? t("localDatabase") : t("desktopUnavailable")}
        </span>
        <span className="database-path mono" title={catalog?.databasePath}>
          {catalog?.databasePath}
        </span>
        <span>
          {catalog
            ? t("catalogCounts", {
                projects: number(counts.projects),
                sessions: number(counts.sessions),
              })
            : t("localData")}
        </span>
        <span>OpenCode {catalog?.opencodeVersion || t("versionUnavailable")}</span>
      </footer>
      {menu && (
        <SessionMenu
          position={menu}
          onClose={closeMenu}
          disabled={actions.pending !== null}
          onAction={(id, action) => void actions.perform(id, action)}
          onRename={(id) => {
            const session = catalog?.sessions.find((item) => item.id === id);
            if (session) rename.ask(session);
          }}
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
      {rename.session && (
        <RenameDialog
          session={rename.session}
          pending={rename.pending}
          error={rename.error}
          onCancel={rename.cancel}
          onConfirm={(title) => void rename.confirm(title)}
        />
      )}
    </div>
  );
}
