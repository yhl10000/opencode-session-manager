import { Check, MessageSquare, MoreHorizontal, Trash2 } from "lucide-react";
import { available, localTime, relativeTime } from "../lib/format";
import type { SessionSummary } from "../lib/types";
import type { MenuPosition } from "./SessionMenu";

type Props = {
  readonly session: SessionSummary;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
  readonly onLaunch: (id: string) => void;
  readonly onMenu: (position: MenuPosition) => void;
  readonly onDelete?: ((id: string) => void) | undefined;
  readonly deleting?: boolean | undefined;
};
export function SessionRow({
  session,
  selected,
  onSelect,
  onLaunch,
  onMenu,
  onDelete,
  deleting,
}: Props) {
  return (
    <div className={`session-row ${selected ? "selected" : ""}`}>
      <button
        type="button"
        className="session-select"
        aria-label={`Select ${session.title || "Untitled session"}`}
        aria-pressed={selected}
        onClick={() => onSelect(session.id)}
        onDoubleClick={() => onLaunch(session.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          onMenu({
            sessionId: session.id,
            x: event.clientX,
            y: event.clientY,
            invoker: event.currentTarget,
          });
        }}
        onKeyDown={(event) => {
          if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") {
            event.preventDefault();
            const bounds = event.currentTarget.getBoundingClientRect();
            onMenu({
              sessionId: session.id,
              x: bounds.left + 24,
              y: bounds.bottom,
              invoker: event.currentTarget,
            });
          }
        }}
      >
        <span className="row-icon">
          {selected ? <Check aria-hidden="true" /> : <MessageSquare aria-hidden="true" />}
        </span>
        <span className="row-content">
          <span className="row-title" title={session.title}>
            {session.title || "Untitled session"}
          </span>
          <span className="row-meta">
            <span title={available(session.model)}>{available(session.model)}</span>
            <span>{session.messageCount} messages</span>
            {session.tokens !== null && (
              <span title={`${session.tokens.toLocaleString()} tokens`}>
                {new Intl.NumberFormat("en", {
                  notation: "compact",
                  maximumFractionDigits: 1,
                }).format(session.tokens)}{" "}
                tokens
              </span>
            )}
          </span>
        </span>
        <time
          dateTime={new Date(session.updatedAt).toISOString()}
          title={localTime(session.updatedAt)}
        >
          {relativeTime(session.updatedAt)}
        </time>
      </button>
      {onDelete && (
        <button
          type="button"
          className="icon-button row-delete"
          aria-label={`Delete session ${session.title || "Untitled session"}`}
          title="Delete session"
          disabled={deleting}
          onClick={() => onDelete(session.id)}
        >
          <Trash2 aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        className="icon-button row-more"
        aria-label={`Actions for ${session.title || "Untitled session"}`}
        title="Session actions"
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          onMenu({
            sessionId: session.id,
            x: bounds.right,
            y: bounds.bottom,
            invoker: event.currentTarget,
          });
        }}
      >
        <MoreHorizontal aria-hidden="true" />
      </button>
    </div>
  );
}
