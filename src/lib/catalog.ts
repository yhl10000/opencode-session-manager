import type { Catalog, Project, SessionSummary, SortOrder } from "./types";

export type ProjectGroup = {
  readonly project: Project;
  readonly sessions: readonly SessionSummary[];
  readonly latestActivity: number;
};
export const PAGE_SIZE = 20;

export type CatalogView = {
  readonly sort: SortOrder;
  readonly query: string;
  readonly showChildSessions: boolean;
  readonly pinnedSessionIds: readonly string[];
};

export function buildGroups(catalog: Catalog, view: CatalogView): readonly ProjectGroup[] {
  const terms = view.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const pinned = new Set(view.pinnedSessionIds);
  const grouped = new Map<string, SessionSummary[]>();
  for (const session of catalog.sessions) {
    if (!view.showChildSessions && session.parentId !== null) continue;
    const bucket = grouped.get(session.projectId) ?? [];
    bucket.push(session);
    grouped.set(session.projectId, bucket);
  }
  const groups = catalog.projects
    .map((project) => {
      const all = grouped.get(project.id) ?? [];
      const projectText = `${project.name} ${project.path} ${project.id}`.toLocaleLowerCase();
      const sessions = all.filter((session) => {
        const haystack =
          `${projectText} ${session.title} ${session.id} ${session.directory} ${session.model ?? ""} ${session.provider ?? ""}`.toLocaleLowerCase();
        return terms.every((term) => haystack.includes(term));
      });
      sessions.sort(
        (left, right) =>
          Number(pinned.has(right.id)) - Number(pinned.has(left.id)) ||
          right.updatedAt - left.updatedAt ||
          left.id.localeCompare(right.id),
      );
      return {
        project,
        sessions,
        latestActivity: sessions.reduce(
          (latest, session) => Math.max(latest, session.updatedAt),
          0,
        ),
      };
    })
    .filter((group) => group.sessions.length > 0);
  return groups.sort(
    (left, right) =>
      (view.sort === "activity"
        ? right.latestActivity - left.latestActivity
        : left.project.name.localeCompare(right.project.name)) ||
      left.project.id.localeCompare(right.project.id),
  );
}

export function isExpanded(
  projectId: string,
  collapsed: readonly string[],
  query: string,
): boolean {
  return query.trim().length > 0 || !collapsed.includes(projectId);
}

export function loadMore(
  pages: Readonly<Record<string, number>>,
  projectId: string,
): Readonly<Record<string, number>> {
  return { ...pages, [projectId]: (pages[projectId] ?? PAGE_SIZE) + PAGE_SIZE };
}
