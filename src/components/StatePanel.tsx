import { AlertCircle, Layers, Monitor, Search } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  readonly title: string;
  readonly children: ReactNode;
  readonly kind?: "error" | "desktop" | "empty" | "search";
  readonly action?: ReactNode;
};
export function StatePanel({ title, children, kind = "empty", action }: Props) {
  const Icon = { error: AlertCircle, desktop: Monitor, empty: Layers, search: Search }[kind];
  return (
    <div
      className={`state-panel ${kind === "error" ? "error" : ""}`}
      role={kind === "error" ? "alert" : undefined}
    >
      <div className="state-icon">
        <Icon aria-hidden="true" />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
