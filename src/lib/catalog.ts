import type { Catalog, Project, SessionSummary, SortOrder } from "./types";

export type ProjectGroup = {
  readonly project: Project;
  readonly sessions: readonly SessionSummary[];
  readonly latestActivity: number;
};
export const PAGE_SIZE = 20;

export function buildGroups(
  catalog: Catalog,
  sort: SortOrder,
  query: string,
): readonly ProjectGroup[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const grouped = new Map<string, SessionSummary[]>();
  for (const session of catalog.sessions) {
    const bucket = grouped.get(session.projectId) ?? [];
    bucket.push(session);
    grouped.set(session.projectId, bucket);
  }
  const groups = catalog.projects
    .map((project) => {
      const all = (grouped.get(project.id) ?? []).sort(
        (left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id),
      );
      const projectText = `${project.name} ${project.path} ${project.id}`.toLocaleLowerCase();
      const sessions = all.filter((session) => {
        const haystack =
          `${projectText} ${session.title} ${session.id} ${session.directory} ${session.model ?? ""} ${session.provider ?? ""}`.toLocaleLowerCase();
        return terms.every((term) => haystack.includes(term));
      });
      return { project, sessions, latestActivity: all[0]?.updatedAt ?? 0 };
    })
    .filter(
      (group) =>
        terms.length === 0 ||
        group.sessions.length > 0 ||
        terms.every((term) =>
          `${group.project.name} ${group.project.path} ${group.project.id}`
            .toLocaleLowerCase()
            .includes(term),
        ),
    );
  return groups.sort(
    (left, right) =>
      (sort === "activity"
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
