import { useEffect, useRef } from "react";

export type DeleteRequest = {
  readonly label: string;
  readonly path: string;
  readonly ids: readonly string[];
  readonly hiddenChildCount?: number;
};

type Props = {
  readonly request: DeleteRequest;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
};

export function DeleteDialog({ request, pending, error, onCancel, onConfirm }: Props) {
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
        <h2 id="delete-title">Delete {request.label}?</h2>
        <p id="delete-description">
          Permanently delete {request.ids.length} sessions and their conversation history from
          OpenCode. This cannot be undone. Project files and folders will not be deleted.
        </p>
        {Boolean(request.hiddenChildCount) && (
          <p>Includes {request.hiddenChildCount} hidden child sessions.</p>
        )}
        <p className="mono">{request.path}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button ref={cancel} type="button" disabled={pending} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="delete-confirm" disabled={pending} onClick={onConfirm}>
            {pending ? "Deleting..." : "Confirm deletion"}
          </button>
        </div>
      </div>
    </div>
  );
}
