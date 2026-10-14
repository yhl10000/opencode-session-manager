import { Copy, FolderOpen, PanelTop, Pencil, SquareArrowOutUpRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SessionAction } from "../hooks/useActions";

export type MenuPosition = {
  readonly sessionId: string;
  readonly x: number;
  readonly y: number;
  readonly invoker: HTMLElement;
};
type Props = {
  readonly position: MenuPosition;
  readonly onClose: () => void;
  readonly onAction: (id: string, action: SessionAction) => void;
  readonly disabled: boolean;
  readonly onRename?: (id: string) => void;
};
const items = [
  { action: "tab", label: "Open in tab", Icon: PanelTop },
  { action: "window", label: "Open in window", Icon: SquareArrowOutUpRight },
  { action: "copy", label: "Copy session ID", Icon: Copy },
  { action: "directory", label: "Open directory", Icon: FolderOpen },
] as const;

export function SessionMenu({ position, onClose, onAction, disabled, onRename }: Props) {
  const menu = useRef<HTMLDivElement>(null);
  const [point, setPoint] = useState({ x: position.x, y: position.y });
  useLayoutEffect(() => {
    const bounds = menu.current?.getBoundingClientRect();
    if (bounds)
      setPoint({
        x: Math.max(8, Math.min(position.x, window.innerWidth - bounds.width - 8)),
        y: Math.max(8, Math.min(position.y, window.innerHeight - bounds.height - 8)),
      });
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [position]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) onClose();
    };
    const close = () => onClose();
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", close);
    const invoker = position.invoker;
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", close);
      invoker.focus();
    };
  }, [position.invoker, onClose]);
  return (
    <div
      ref={menu}
      className="session-menu"
      role="menu"
      aria-label="Session actions"
      style={{ left: point.x, top: point.y }}
      onKeyDown={(event) => {
        const buttons = Array.from(
          menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
        );
        const active = document.activeElement;
        const index = active instanceof HTMLButtonElement ? buttons.indexOf(active) : -1;
        switch (event.key) {
          case "Escape":
            event.preventDefault();
            onClose();
            break;
          case "Tab":
            onClose();
            break;
          case "ArrowDown":
            event.preventDefault();
            buttons[(index + 1) % buttons.length]?.focus();
            break;
          case "ArrowUp":
            event.preventDefault();
            buttons[(index + buttons.length - 1) % buttons.length]?.focus();
            break;
          case "Home":
            event.preventDefault();
            buttons[0]?.focus();
            break;
          case "End":
            event.preventDefault();
            buttons.at(-1)?.focus();
            break;
        }
      }}
    >
      {items.map(({ action, label, Icon }) => (
        <button
          type="button"
          role="menuitem"
          key={action}
          aria-disabled={disabled}
          onClick={() => {
            if (!disabled) {
              onAction(position.sessionId, action);
              onClose();
            }
          }}
        >
          <Icon aria-hidden="true" />
          {label}
        </button>
      ))}
      {onRename && (
        <button
          type="button"
          role="menuitem"
          aria-disabled={disabled}
          onClick={() => {
            if (!disabled) {
              onClose();
              onRename(position.sessionId);
            }
          }}
        >
          <Pencil aria-hidden="true" />
          Rename session
        </button>
      )}
    </div>
  );
}
