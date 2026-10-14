export function installFixture() {
  const now = Date.now();
  const projects = [
    { id: "engine", name: "Runtime Engine", path: "Q:\\workspace\\runtime-engine" },
    { id: "studio", name: "Developer Studio", path: "Q:\\workspace\\developer-studio" },
    { id: "empty", name: "Notes", path: "Q:\\workspace\\notes" },
  ];
  const sessions = projects.slice(0, 2).flatMap((project, group) =>
    Array.from({ length: group === 0 ? 45 : 23 }, (_, index) => ({
      id: `ses_${project.id}_${index}`,
      projectId: project.id,
      title:
        index === 0
          ? group === 0
            ? "Refine the session dispatch pipeline"
            : "调整开发工作区的布局"
          : [
              "Trace cancellation in the worker pool",
              "Review filesystem boundaries",
              "Simplify the catalog query",
              "Add regression coverage",
              "Investigate startup latency",
            ][index % 5],
      directory: project.path,
      createdAt: now - (index + 20) * 3600000,
      updatedAt: now - (index + group * 6) * 3600000,
      messageCount: 6 + index,
      model: index % 3 === 0 ? null : "gpt-5.1-codex",
      provider: index % 3 === 0 ? null : "github-copilot",
      tokens: index % 3 === 0 ? null : 18400 + index,
      parentId: index % 4 === 0 ? "ses_parent" : null,
    })),
  );
  const catalog = () => ({
    databasePath: "Q:\\test-only\\opencode.db",
    opencodeVersion: "1.19.0",
    projects: projects.filter((project) =>
      sessions.some(
        (item) => item.projectId === project.id && !window.__QA_DELETED__.includes(item.id),
      ),
    ),
    sessions: sessions.filter((item) => !window.__QA_DELETED__.includes(item.id)),
  });
  window.__QA_CALLS__ = [];
  window.__QA_FAILURE__ = null;
  window.__QA_DELETED__ = [];
  window.__TAURI_INTERNALS__ = {
    invoke: async (command, args = {}) => {
      window.__QA_CALLS__.push({ command, args });
      if (window.__QA_FAILURE__ === command)
        throw new Error("Test desktop unavailable. Retry the request.");
      switch (command) {
        case "get_catalog":
          return catalog();
        case "get_session_detail":
          return {
            session: sessions.find((item) => item.id === args.sessionId),
            preview: [
              {
                id: "m1",
                role: "user",
                text: "Review the session launcher. Keep tab and window dispatch independent, and preserve the working directory as a literal path.",
                createdAt: now - 420000,
              },
              {
                id: "m2",
                role: "assistant",
                text: "The launcher boundary now receives a session ID and an explicit mode.\n\nNext checks\n  1. Verify Windows Terminal arguments.\n  2. Confirm stale detail requests cannot replace the selected session.\n\n路径与会话文本只在本机显示，不发送到外部服务。\n\n<script>alert('plain text only')</script>",
                createdAt: now - 300000,
              },
            ],
            previewTruncated: true,
          };
        case "rename_session": {
          const session = sessions.find((item) => item.id === args.sessionId);
          if (!session) throw new Error("Session unavailable");
          session.title = args.title;
          return catalog();
        }
        case "launch_session":
          return `test dispatch receipt (${args.mode})`;
        case "open_directory":
          return null;
        case "delete_sessions":
          window.__QA_DELETED__.push(...args.sessionIds);
          return { catalog: catalog(), deletedIds: args.sessionIds, errors: [] };
        default:
          throw new Error(`Unexpected QA command ${command}`);
      }
    },
  };
}
