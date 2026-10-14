import { describe, expect, it } from "vitest";
import { catalog, session } from "../test/fixtures";
import { buildGroups, isExpanded, loadMore } from "./catalog";
import { readPreferences } from "./preferences";

describe("catalog explorer", () => {
  it("keeps sessions newest first when project sort changes", () => {
    const input = {
      ...catalog,
      sessions: [session({ id: "old", updatedAt: 1 }), session({ id: "new", updatedAt: 9 })],
    };
    const groups = buildGroups(input, "name", "");
    expect(
      groups.find((group) => group.project.id === "a")?.sessions.map((item) => item.id),
    ).toEqual(["new", "old"]);
  });
  it("sorts projects by activity or name without mutating input", () => {
    const byTime = buildGroups(catalog, "activity", "");
    const byName = buildGroups(catalog, "name", "");
    expect(byTime.map((group) => group.project.id)).toEqual(["b", "a"]);
    expect(byName.map((group) => group.project.id)).toEqual(["a", "b"]);
    expect(catalog.projects.map((item) => item.id)).toEqual(["b", "a"]);
  });
  it.each(["alpha", "fix routing", "ses_a", "q:\\alpha", "model-a"])(
    "searches metadata when query is %s",
    (query) => {
      const groups = buildGroups(catalog, "activity", query);
      expect(groups.map((group) => group.project.id)).toEqual(["a"]);
    },
  );
  it("requires all query terms when searching", () => {
    expect(buildGroups(catalog, "activity", "alpha missing")).toEqual([]);
  });
  it("reveals twenty only in requested project when loading more", () => {
    const pages = loadMore({ b: 40 }, "a");
    expect(pages).toEqual({ a: 40, b: 40 });
  });
  it("restores previous collapse when search clears", () => {
    const collapsed = ["a"];
    expect(isExpanded("a", collapsed, "alpha")).toBe(true);
    expect(isExpanded("a", collapsed, "")).toBe(false);
    expect(isExpanded("b", collapsed, "")).toBe(true);
  });
  it("rejects malformed persisted preferences", () => {
    localStorage.setItem(
      "opencode-session-manager.preferences",
      '{"sort":"wrong","collapsed":[4]}',
    );
    expect(readPreferences().value).toEqual({ sort: "activity", collapsed: [] });
  });
});
