import { describe, expect, it } from "vitest";
import { catalog, session } from "../test/fixtures";
import { buildGroups, isExpanded, loadMore } from "./catalog";
import { readPreferences } from "./preferences";

const view = {
  sort: "activity",
  query: "",
  showChildSessions: false,
  pinnedSessionIds: [],
} as const;

describe("catalog explorer", () => {
  it("keeps sessions newest first when project sort changes", () => {
    const input = {
      ...catalog,
      sessions: [session({ id: "old", updatedAt: 1 }), session({ id: "new", updatedAt: 9 })],
    };
    const groups = buildGroups(input, { ...view, sort: "name" });
    expect(
      groups.find((group) => group.project.id === "a")?.sessions.map((item) => item.id),
    ).toEqual(["new", "old"]);
  });
  it("sorts projects by activity or name without mutating input", () => {
    const byTime = buildGroups(catalog, view);
    const byName = buildGroups(catalog, { ...view, sort: "name" });
    expect(byTime.map((group) => group.project.id)).toEqual(["b", "a"]);
    expect(byName.map((group) => group.project.id)).toEqual(["a", "b"]);
    expect(catalog.projects.map((item) => item.id)).toEqual(["b", "a"]);
  });
  it.each(["alpha", "fix routing", "ses_a", "q:\\alpha", "model-a"])(
    "searches metadata when query is %s",
    (query) => {
      const groups = buildGroups(catalog, { ...view, query });
      expect(groups.map((group) => group.project.id)).toEqual(["a"]);
    },
  );
  it("requires all query terms when searching", () => {
    expect(buildGroups(catalog, { ...view, query: "alpha missing" })).toEqual([]);
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
    expect(readPreferences().value).toEqual({
      sort: "activity",
      collapsed: [],
      showChildSessions: false,
      pinnedSessionIds: [],
    });
  });
  it("hides child-only groups even when the project matches search", () => {
    const input = { ...catalog, sessions: [session({ parentId: "parent" })] };

    expect(buildGroups(input, { ...view, query: "alpha" })).toEqual([]);
    expect(buildGroups(input, { ...view, showChildSessions: true })[0]?.sessions).toHaveLength(1);
    expect(input.sessions).toHaveLength(1);
  });
  it("sorts multiple pins by activity within their project without promoting the project", () => {
    const input = {
      ...catalog,
      sessions: [
        session({ id: "old-pin", updatedAt: 1 }),
        session({ id: "new-pin", updatedAt: 3 }),
        session({ id: "normal", updatedAt: 5 }),
        session({ id: "beta", projectId: "b", updatedAt: 10 }),
      ],
    };

    const groups = buildGroups(input, { ...view, pinnedSessionIds: ["old-pin", "new-pin"] });

    expect(groups.map((group) => group.project.id)).toEqual(["b", "a"]);
    expect(groups[1]?.sessions.map((item) => item.id)).toEqual(["new-pin", "old-pin", "normal"]);
    expect(groups[1]?.latestActivity).toBe(5);
  });
  it("applies child visibility and search to pins before counting or paging", () => {
    const input = {
      ...catalog,
      sessions: [
        session({ id: "pin", title: "Other" }),
        session({ id: "child", title: "Match", parentId: "parent" }),
        session({ id: "normal", title: "Match" }),
      ],
    };

    const groups = buildGroups(input, {
      ...view,
      query: "match",
      pinnedSessionIds: ["pin", "child"],
    });

    expect(groups.flatMap((group) => group.sessions.map((item) => item.id))).toEqual(["normal"]);
  });
});
