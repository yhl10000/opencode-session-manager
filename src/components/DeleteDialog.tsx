import { useEffect, useRef } from "react";
import { Message, useLocale } from "../i18n/locale";
import type { UiMessage } from "../i18n/messages";

export type DeleteRequest = {
  readonly label: string;
  readonly path: string;
  readonly ids: readonly string[];
  readonly hiddenChildCount?: number;
};

type Props = {
  readonly request: DeleteRequest;
  readonly pending: boolean;
  readonly error: UiMessage | null;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
};

export function DeleteDialog({ request, pending, error, onCancel, onConfirm }: Props) {
  const { t, number } = useLocale();
  const panel = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    cancel.current?.focus();
    const keepFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) {
        panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      }
    };
    document.addEventListener("focusin", keepFocus);
    return () => {
      document.removeEventListener("focusin", keepFocus);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <div className="dialog-backdrop">
      <div
        ref={panel}
        className="delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        aria-describedby="delete-description"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !pending) onCancel();
          if (event.key === "Tab") {
            const buttons = Array.from(
              panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
            );
            const first = buttons[0];
            const last = buttons.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            }
            if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <h2 id="delete-title">{t("deleteTitle", { title: request.label || t("untitled") })}</h2>
        <p id="delete-description">
          {t("deleteExplanation", { count: number(request.ids.length) })}
        </p>
        {Boolean(request.hiddenChildCount) && (
          <p>{t("hiddenChildren", { count: number(request.hiddenChildCount ?? 0) })}</p>
        )}
        <p className="mono">{request.path}</p>
        {error && (
          <p className="error" role="alert">
            <Message message={error} />
          </p>
        )}
        <div className="dialog-actions">
          <button ref={cancel} type="button" disabled={pending} onClick={onCancel}>
            {t("cancel")}
          </button>
          <button type="button" className="delete-confirm" disabled={pending} onClick={onConfirm}>
            {t(pending ? "deleting" : "confirmDeletion")}
          </button>
        </div>
      </div>
    </div>
  );
}
