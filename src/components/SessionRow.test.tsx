import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RECENT_ACTIVITY_MS } from "../lib/activity";
import { session } from "../test/fixtures";
import { SessionRow } from "./SessionRow";

it.each([18400, 0])("shows compact token usage when available as %s", (tokens) => {
  render(
    <SessionRow
      session={session({ tokens })}
      selected={false}
      onSelect={vi.fn()}
      onLaunch={vi.fn()}
      onMenu={vi.fn()}
    />,
  );
  const row = screen.getByRole("button", { name: /Select Fix routing/ });
  expect(
    within(row).getByText(
      `${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(tokens)} tokens`,
    ),
  ).toBeInTheDocument();
  expect(within(row).getByTitle(`${tokens.toLocaleString()} tokens`)).toBeInTheDocument();
});

it("omits token usage when unavailable", () => {
  render(
    <SessionRow
      session={session({ tokens: null })}
      selected={false}
      onSelect={vi.fn()}
      onLaunch={vi.fn()}
      onMenu={vi.fn()}
    />,
  );
  expect(
    within(screen.getByRole("button", { name: /Select Fix routing/ })).queryByText(/tokens/),
  ).not.toBeInTheDocument();
});

it("marks recent activity separately from selection and removes it when expired", () => {
  const now = 1800000000000;
  const props = {
    session: session({ updatedAt: now - 1000 }),
    selected: true,
    onSelect: vi.fn(),
    onLaunch: vi.fn(),
    onMenu: vi.fn(),
  };
  const view = render(<SessionRow {...props} now={now} />);
  expect(screen.getByText("Recent")).toHaveAttribute("title", "Active within the last 72 hours");
  expect(screen.getByRole("button", { name: "Select Fix routing" }).parentElement).toHaveClass(
    "recent",
    "selected",
  );
  view.rerender(<SessionRow {...props} now={now + RECENT_ACTIVITY_MS} />);
  expect(screen.queryByText("Recent")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Select Fix routing" }).parentElement).toHaveClass(
    "selected",
  );
});
