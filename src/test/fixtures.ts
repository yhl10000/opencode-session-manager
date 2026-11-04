import type { Catalog, SessionSummary } from "../lib/types";

export function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "ses_a",
    projectId: "a",
    title: "Fix routing",
    directory: "Q:\\alpha",
    createdAt: 1,
    updatedAt: 2,
    messageCount: 3,
    model: "model-a",
    provider: "provider-a",
    tokens: null,
    parentId: null,
    ...overrides,
  };
}

export const catalog: Catalog = {
  databasePath: "Q:\\test\\opencode.db",
  opencodeVersion: "1.0.0",
  projects: [
    { id: "b", name: "Beta", path: "Q:\\beta" },
    { id: "a", name: "Alpha", path: "Q:\\alpha" },
  ],
  sessions: [
    session(),
    session({
      id: "ses_b",
      projectId: "b",
      title: "Build parser",
      directory: "Q:\\beta",
      model: null,
      provider: null,
      updatedAt: 10,
    }),
  ],
};

export const v2Catalog: Catalog = {
  ...catalog,
  opencodeVersion: "opencode v2.2.5",
  sessions: [
    session({ id: "ses_v2", title: "", model: null, provider: null, tokens: null }),
    session({
      id: "ses_v2_child",
      title: "Child session",
      model: null,
      provider: null,
      tokens: null,
      parentId: "ses_v2",
      updatedAt: 3,
    }),
  ],
};
