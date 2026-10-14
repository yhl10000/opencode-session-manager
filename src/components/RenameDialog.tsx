import { useEffect, useRef, useState } from "react";
import { Message, useLocale } from "../i18n/locale";
import type { UiMessage } from "../i18n/messages";
import type { SessionSummary } from "../lib/types";

type Props = {
  readonly session: SessionSummary;
  readonly pending: boolean;
  readonly error: UiMessage | null;
  readonly onCancel: () => void;
  readonly onConfirm: (title: string) => void;
};

export function RenameDialog({ session, pending, error, onCancel, onConfirm }: Props) {
  const { t } = useLocale();
  const [title, setTitle] = useState(session.title);
  const panel = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    input.current?.focus();
    input.current?.select();
    const keepFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target))
        input.current?.focus();
    };
    document.addEventListener("focusin", keepFocus);
    return () => {
      document.removeEventListener("focusin", keepFocus);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <div className="dialog-backdrop">
      <form
        ref={panel}
        className="delete-dialog rename-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-title"
        aria-describedby="rename-description"
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim() && !pending) onConfirm(title.trim());
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !pending) onCancel();
          if (event.key === "Tab") {
            const controls = Array.from(
              panel.current?.querySelectorAll<HTMLElement>("input, button:not(:disabled)") ?? [],
            );
            const first = controls[0];
            const last = controls.at(-1);
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
        <h2 id="rename-title">{t("rename")}</h2>
        <p id="rename-description">{t("renameExplanation")}</p>
        <label htmlFor="rename-input">{t("sessionTitle")}</label>
        <input
          ref={input}
          id="rename-input"
          value={title}
          readOnly={pending}
          aria-describedby={!title.trim() ? "rename-validation" : undefined}
          aria-invalid={!title.trim()}
          onChange={(event) => setTitle(event.target.value)}
        />
        {!title.trim() && <p id="rename-validation">{t("titleRequired")}</p>}
        {error && (
          <p className="error" role="alert">
            <Message message={error} />
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" disabled={pending} onClick={onCancel}>
            {t("cancel")}
          </button>
          <button type="submit" className="primary" disabled={pending || !title.trim()}>
            {t(pending ? "saving" : "saveTitle")}
          </button>
        </div>
      </form>
    </div>
  );
}
