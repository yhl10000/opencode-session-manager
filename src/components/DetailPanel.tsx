import {
  Copy,
  FolderOpen,
  LockKeyhole,
  MessageSquare,
  PanelTop,
  RefreshCw,
  SquareArrowOutUpRight,
} from "lucide-react";
import type { SessionAction } from "../hooks/useActions";
import { useDetail } from "../hooks/useDetail";
import { Message, useLocale } from "../i18n/locale";
import { available, localTime } from "../lib/format";
import { assertNever, type Resource, type SessionDetail, type SessionSummary } from "../lib/types";
import { StatePanel } from "./StatePanel";

type Props = {
  readonly session: SessionSummary;
  readonly projectName: string;
  readonly pending: boolean;
  readonly onAction: (id: string, action: SessionAction) => void;
};
function Preview({
  state,
  retry,
}: {
  readonly state: Resource<SessionDetail>;
  readonly retry: () => void;
}) {
  const { t, locale } = useLocale();
  switch (state.status) {
    case "loading":
      return (
        <div className="preview-placeholder" role="status">
          {t("loadingPreview")}
        </div>
      );
    case "error":
      return (
        <StatePanel
          kind="error"
          title={t("previewFailed")}
          action={
            <button type="button" onClick={retry}>
              {t("retryPreview")}
            </button>
          }
        >
          <Message message={state.error} />
        </StatePanel>
      );
    case "ready":
      return (
        <>
          {state.data.preview.length === 0 && (
            <StatePanel title={t("noPreview")}>{t("noPreviewExplanation")}</StatePanel>
          )}
          {state.data.preview.map((message) => (
            <article className="preview-message" key={message.id}>
              <div className="message-heading">
                <strong>
                  {message.role === "user" ||
                  message.role === "assistant" ||
                  message.role === "system" ||
                  message.role === "tool"
                    ? t(message.role)
                    : message.role}
                </strong>
                <time>{localTime(message.createdAt, locale)}</time>
              </div>
              <pre>{message.text || t("noText")}</pre>
            </article>
          ))}
          {state.data.previewTruncated && <p className="preview-note">{t("previewTruncated")}</p>}
        </>
      );
    default:
      return assertNever(state);
  }
}
export function DetailPanel({ session, projectName, pending, onAction }: Props) {
  const { t, locale, number } = useLocale();
  const { state, retry } = useDetail(session.id);
  const data = state.status === "ready" ? state.data.session : session;
  return (
    <section className="detail" aria-label={t("details")}>
      <header className="detail-toolbar">
        <span>
          <MessageSquare aria-hidden="true" />
          {t("details")}
        </span>
        <span className="read-only">
          <LockKeyhole aria-hidden="true" />
          {t("readOnly")}
        </span>
      </header>
      <div className="detail-scroll">
        <div className="session-heading">
          <div className="eyebrow">{projectName}</div>
          <h1>{data.title || t("untitled")}</h1>
          <p className="directory mono">{data.directory || t("directoryUnavailable")}</p>
        </div>
        <div className="session-actions">
          <button
            type="button"
            className="primary"
            disabled={pending}
            onClick={() => onAction(session.id, "tab")}
          >
            <PanelTop aria-hidden="true" />
            {t(pending ? "dispatching" : "openTab")}
          </button>
          <button type="button" disabled={pending} onClick={() => onAction(session.id, "window")}>
            <SquareArrowOutUpRight aria-hidden="true" />
            {t("openWindow")}
          </button>
          <button
            type="button"
            className="icon-button"
            disabled={state.status === "loading"}
            title={t("refreshMetadata")}
            aria-label={t("refreshMetadata")}
            onClick={retry}
          >
            <RefreshCw aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            disabled={pending}
            title={t("openDirectory")}
            aria-label={t("openDirectory")}
            onClick={() => onAction(session.id, "directory")}
          >
            <FolderOpen aria-hidden="true" />
          </button>
        </div>
        <dl className="metadata">
          <div className="metadata-wide">
            <dt>{t("sessionId")}</dt>
            <dd className="id-value">
              <span className="mono">{data.id}</span>
              <button
                type="button"
                className="icon-button"
                title={t("copyId")}
                aria-label={t("copyId")}
                disabled={pending}
                onClick={() => onAction(session.id, "copy")}
              >
                <Copy aria-hidden="true" />
              </button>
            </dd>
          </div>
          <div>
            <dt>{t("model")}</dt>
            <dd>{available(data.model, locale)}</dd>
          </div>
          <div>
            <dt>{t("provider")}</dt>
            <dd>{available(data.provider, locale)}</dd>
          </div>
          <div>
            <dt>{t("messageLabel")}</dt>
            <dd>{number(data.messageCount)}</dd>
          </div>
          <div>
            <dt>{t("tokenLabel")}</dt>
            <dd>{data.tokens === null ? t("unavailable") : number(data.tokens)}</dd>
          </div>
          <div>
            <dt>{t("created")}</dt>
            <dd>{localTime(data.createdAt, locale)}</dd>
          </div>
          <div>
            <dt>{t("lastActivity")}</dt>
            <dd>{localTime(data.updatedAt, locale)}</dd>
          </div>
          {data.parentId !== null && (
            <div className="metadata-wide">
              <dt>{t("parentSession")}</dt>
              <dd className="mono">{data.parentId}</dd>
            </div>
          )}
        </dl>
        <div className="preview-heading">
          <h2>{t("conversationPreview")}</h2>
          <span>{t("plainText")}</span>
        </div>
        <div className="preview">
          <Preview state={state} retry={retry} />
        </div>
      </div>
    </section>
  );
}
