import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
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
