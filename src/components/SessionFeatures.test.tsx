import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { catalog, session } from "../test/fixtures";
import { Explorer } from "./Explorer";

const callbacks = { onSelect: vi.fn(), onLaunch: vi.fn(), onMenu: vi.fn() };
const input = {
  ...catalog,
  sessions: [
    session({ id: "one", title: "First pin", updatedAt: 1 }),
    session({ id: "two", title: "Second pin", updatedAt: 2 }),
    session({ id: "normal", title: "Normal", updatedAt: 3 }),
    session({ id: "child", title: "Child", parentId: "one", updatedAt: 4 }),
    session({ id: "beta-child", projectId: "b", title: "Beta child", parentId: "one" }),
  ],
};

it("hides child sessions and child-only groups with visible counts by default", () => {
  render(<Explorer catalog={input} selectedId={null} {...callbacks} />);

  expect(screen.getByRole("checkbox", { name: "Show child sessions" })).not.toBeChecked();
  expect(screen.queryByRole("button", { name: "Select Child" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Beta" })).not.toBeInTheDocument();
  expect(screen.getByText("1 projects")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "child" } });
  expect(screen.getByText("0 matches")).toBeInTheDocument();
});

it("restores child visibility when the explorer remounts", () => {
  const first = render(<Explorer catalog={input} selectedId={null} {...callbacks} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Show child sessions" }));
  first.unmount();

  render(<Explorer catalog={input} selectedId={null} {...callbacks} />);

  expect(screen.getByRole("checkbox", { name: "Show child sessions" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Select Child" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Beta" })).toBeInTheDocument();
});

it("paginates visible sessions without letting hidden children consume a page", () => {
  const sessions = Array.from({ length: 25 }, (_, index) =>
    session({ id: `parent-${index}`, title: `Parent ${index}`, updatedAt: index }),
  );
  render(
    <Explorer
      catalog={{
        ...catalog,
        sessions: [
          ...sessions,
          ...sessions.map((parent) =>
            session({
              id: `child-${parent.id}`,
              title: "Hidden",
              parentId: parent.id,
              updatedAt: 100,
            }),
          ),
        ],
      }}
      selectedId={null}
      {...callbacks}
    />,
  );

  expect(screen.getAllByRole("button", { name: /^Select Parent/ })).toHaveLength(20);
  fireEvent.click(screen.getByRole("button", { name: "Load 5 more 5 remaining" }));

  expect(screen.getAllByRole("button", { name: /^Select Parent/ })).toHaveLength(25);
  expect(screen.queryByRole("button", { name: "Select Hidden" })).not.toBeInTheDocument();
});

it("restores multiple project pins and still filters pinned rows", () => {
  const first = render(<Explorer catalog={input} selectedId={null} {...callbacks} />);
  fireEvent.click(screen.getByRole("button", { name: "Pin session First pin" }));
  fireEvent.click(screen.getByRole("button", { name: "Pin session Second pin" }));
  first.unmount();

  render(<Explorer catalog={input} selectedId={null} {...callbacks} />);

  const group = within(screen.getByRole("region", { name: "Alpha" }));
  expect(group.getAllByRole("button", { name: /^Select / }).map((row) => row.textContent)).toEqual([
    expect.stringContaining("Second pin"),
    expect.stringContaining("First pin"),
    expect.stringContaining("Normal"),
  ]);
  expect(screen.getByRole("button", { name: "Unpin session First pin" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Normal" } });
  expect(group.getAllByRole("button", { name: /^Select / })).toHaveLength(1);
  expect(screen.getByText("1 matches")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  fireEvent.click(screen.getByRole("button", { name: "Unpin session First pin" }));
  expect(screen.getByRole("button", { name: "Pin session First pin" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(screen.getByRole("button", { name: "Unpin session Second pin" })).toBeInTheDocument();
});
