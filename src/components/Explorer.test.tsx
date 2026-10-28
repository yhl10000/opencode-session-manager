import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { catalog, session } from "../test/fixtures";
import { Explorer } from "./Explorer";

it("collapses every group while retaining selection and loaded pages", () => {
  const input = {
    ...catalog,
    sessions: [
      ...Array.from({ length: 45 }, (_, index) =>
        session({ id: `ses_a${index}`, title: `Alpha ${index}`, updatedAt: index }),
      ),
      session({ id: "ses_b", projectId: "b", title: "Beta session" }),
    ],
  };
  const onSelect = vi.fn();
  render(
    <Explorer
      catalog={input}
      selectedId="ses_a44"
      onSelect={onSelect}
      onLaunch={vi.fn()}
      onMenu={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Load 20 more/ }));

  fireEvent.click(screen.getByRole("button", { name: "Collapse all projects" }));

  expect(screen.queryByRole("button", { name: /Select / })).not.toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole("region", { name: "Alpha" })).getByRole("button"));
  expect(screen.getAllByRole("button", { name: /Select Alpha/ })).toHaveLength(40);
  expect(screen.getByRole("button", { name: "Select Alpha 44" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.queryByRole("button", { name: "Select Beta session" })).not.toBeInTheDocument();
});

it("keeps search results expanded and restores collapse-all after clearing search", () => {
  render(
    <Explorer
      catalog={catalog}
      selectedId={null}
      onSelect={vi.fn()}
      onLaunch={vi.fn()}
      onMenu={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Collapse all projects" }));

  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "alpha" } });

  expect(screen.getByRole("button", { name: "Collapse all projects" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Select Fix routing" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.queryByRole("button", { name: /Select / })).not.toBeInTheDocument();
});

it("expands all groups after collapse while preserving loaded pages", () => {
  render(
    <Explorer
      catalog={catalog}
      selectedId={null}
      onSelect={vi.fn()}
      onLaunch={vi.fn()}
      onMenu={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Collapse all projects" }));

  fireEvent.click(screen.getByRole("button", { name: "Expand all projects" }));

  expect(screen.getAllByRole("button", { name: /Select / })).toHaveLength(2);
});

it("opens the project's directory while the project is collapsed and without selecting a session", () => {
  const onOpenProject = vi.fn();
  const onSelect = vi.fn();
  render(
    <Explorer
      catalog={catalog}
      selectedId={null}
      onSelect={onSelect}
      onLaunch={vi.fn()}
      onMenu={vi.fn()}
      onOpenProject={onOpenProject}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Collapse all projects" }));
  fireEvent.click(screen.getByRole("button", { name: "Open project folder Alpha" }));
  expect(onOpenProject).toHaveBeenCalledWith("ses_a");
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Select Fix routing" })).not.toBeInTheDocument();
});
