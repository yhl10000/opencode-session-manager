import { Check, MessageSquare, MoreHorizontal, Pin, PinOff, Trash2 } from "lucide-react";
import { useLocale } from "../i18n/locale";
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
  readonly pinned?: boolean;
  readonly onTogglePin?: (id: string) => void;
};
export function SessionRow({
  session,
  selected,
  onSelect,
  onLaunch,
  onMenu,
  onDelete,
  deleting,
  pinned,
  onTogglePin,
}: Props) {
  const { t, locale, number, compact } = useLocale();
  const title = session.title || t("untitled");
  return (
    <div className={`session-row ${selected ? "selected" : ""}`}>
      <button
        type="button"
        className="session-select"
        aria-label={t("selectSession", { title })}
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
            {title}
          </span>
          <span className="row-meta">
            <span title={available(session.model, locale)}>{available(session.model, locale)}</span>
            <span>{t("messages", { count: number(session.messageCount) })}</span>
            {session.tokens !== null && (
              <span title={t("tokens", { count: number(session.tokens) })}>
                {t("tokens", { count: compact(session.tokens) })}
              </span>
            )}
          </span>
        </span>
        <time
          dateTime={new Date(session.updatedAt).toISOString()}
          title={localTime(session.updatedAt, locale)}
        >
          {relativeTime(session.updatedAt, locale)}
        </time>
      </button>
      {onTogglePin && (
        <button
          type="button"
          className="icon-button row-pin"
          aria-label={t(pinned ? "unpinSession" : "pinSession", { title })}
          aria-pressed={Boolean(pinned)}
          title={t(pinned ? "unpinHint" : "pinHint")}
          onClick={() => onTogglePin(session.id)}
        >
          {pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          className="icon-button row-delete"
          aria-label={t("deleteSession", { title })}
          title={t("deleteHint")}
          disabled={deleting}
          onClick={() => onDelete(session.id)}
        >
          <Trash2 aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        className="icon-button row-more"
        aria-label={t("actionsFor", { title })}
        title={t("sessionActions")}
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
