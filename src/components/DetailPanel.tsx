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
  switch (state.status) {
    case "loading":
      return (
        <div className="preview-placeholder" role="status">
          Loading read-only preview...
        </div>
      );
    case "error":
      return (
        <StatePanel
          kind="error"
          title="Preview could not load"
          action={
            <button type="button" onClick={retry}>
              Retry preview
            </button>
          }
        >
          {state.error}
        </StatePanel>
      );
    case "ready":
      return (
        <>
          {state.data.preview.length === 0 && (
            <StatePanel title="No text preview">
              This session has no previewable messages. You can still open it in OpenCode.
            </StatePanel>
          )}
          {state.data.preview.map((message) => (
            <article className="preview-message" key={message.id}>
              <div className="message-heading">
                <strong>{message.role}</strong>
                <time>{localTime(message.createdAt)}</time>
              </div>
              <pre>{message.text || "No text content"}</pre>
            </article>
          ))}
          {state.data.previewTruncated && (
            <p className="preview-note">
              Preview truncated. Open the session in OpenCode for the full conversation.
            </p>
          )}
        </>
      );
    default:
      return assertNever(state);
  }
}
export function DetailPanel({ session, projectName, pending, onAction }: Props) {
  const { state, retry } = useDetail(session.id);
  const data = state.status === "ready" ? state.data.session : session;
  return (
    <section className="detail" aria-label="Session details">
      <header className="detail-toolbar">
        <span>
          <MessageSquare aria-hidden="true" />
          Session details
        </span>
        <span className="read-only">
          <LockKeyhole aria-hidden="true" />
          Read only
        </span>
      </header>
      <div className="detail-scroll">
        <div className="session-heading">
          <div className="eyebrow">{projectName}</div>
          <h1>{data.title || "Untitled session"}</h1>
          <p className="directory mono">{data.directory || "Directory unavailable"}</p>
        </div>
        <div className="session-actions">
          <button
            type="button"
            className="primary"
            disabled={pending}
            onClick={() => onAction(session.id, "tab")}
          >
            <PanelTop aria-hidden="true" />
            {pending ? "Dispatching..." : "Open in tab"}
          </button>
          <button type="button" disabled={pending} onClick={() => onAction(session.id, "window")}>
            <SquareArrowOutUpRight aria-hidden="true" />
            Open in window
          </button>
          <button
            type="button"
            className="icon-button"
            disabled={state.status === "loading"}
            title="Refresh session metadata"
            aria-label="Refresh session metadata"
            onClick={retry}
          >
            <RefreshCw aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            disabled={pending}
            title="Open directory"
            aria-label="Open directory"
            onClick={() => onAction(session.id, "directory")}
          >
            <FolderOpen aria-hidden="true" />
          </button>
        </div>
        <dl className="metadata">
          <div className="metadata-wide">
            <dt>Session ID</dt>
            <dd className="id-value">
              <span className="mono">{data.id}</span>
              <button
                type="button"
                className="icon-button"
                title="Copy session ID"
                aria-label="Copy session ID"
                disabled={pending}
                onClick={() => onAction(session.id, "copy")}
              >
                <Copy aria-hidden="true" />
              </button>
            </dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{available(data.model)}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{available(data.provider)}</dd>
          </div>
          <div>
            <dt>Messages</dt>
            <dd>{data.messageCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Tokens</dt>
            <dd>{data.tokens === null ? "Unavailable" : data.tokens.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{localTime(data.createdAt)}</dd>
          </div>
          <div>
            <dt>Last activity</dt>
            <dd>{localTime(data.updatedAt)}</dd>
          </div>
          {data.parentId !== null && (
            <div className="metadata-wide">
              <dt>Parent session</dt>
              <dd className="mono">{data.parentId}</dd>
            </div>
          )}
        </dl>
        <div className="preview-heading">
          <h2>Conversation preview</h2>
          <span>Plain text / read only</span>
        </div>
        <div className="preview">
          <Preview state={state} retry={retry} />
        </div>
      </div>
    </section>
  );
}
