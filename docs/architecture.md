# Architecture

OpenCode Session Manager is a Windows desktop application built with Tauri 2, React, TypeScript, and Rust. The frontend presents a catalog and requests local operations through Tauri commands. The Rust backend discovers the OpenCode CLI, reads its SQLite database, prepares bounded session details, and dispatches launch requests to Windows Terminal. Session renaming starts an authenticated loopback OpenCode `--pure serve` process on demand for an HTTP `PATCH`, then stops the managed process. This is not a public or remote service.

## Runtime components

```text
React UI
  | Tauri command invocation
Rust desktop backend
  |-- OpenCode CLI: --version, --help, db path
  |-- OpenCode SQLite database: read-only queries
  |-- OpenCode CLI: on-demand --pure serve for authenticated loopback rename
  `-- Windows Terminal (wt): new tab or window
        `-- pwsh: encoded launch script
              `-- OpenCode CLI: --session <id>
```

The desktop backend owns access to the local database and process launcher. Frontend code consumes typed catalog and detail responses rather than opening SQLite or starting system processes itself. The browser-only frontend state is a desktop-required message, not a web-hosted session service.

## Discovery and database access

At initial discovery, the backend locates `opencode` on `PATH` and queries its version, help output, and `opencode db path`. It requires an absolute path to an existing database file and checks whether the CLI advertises `--session`. The database path is discovered at runtime; it is not tied to a particular user profile or installation directory. Discovery is cached for the lifetime of the application process.

Each catalog or detail operation opens a fresh SQLite connection with read-only access and enables `query_only`. The application does not directly write, migrate or initialize the database, or make a second copy. Confirmed deletion invokes the officially supported `opencode session delete` command. Rename uses the authenticated loopback HTTP API served by the official OpenCode CLI, never direct SQLite writes. OpenCode uses SQLite WAL journaling; the manager does not run a checkpoint or database maintenance operation.

The catalog reads `session` and `message` data for directory groups, session summaries, and message counts. It does not read database project display names or load the body of every message. On selecting a session, detail loading fetches at most 40 messages and their text parts, with a limit of 4,000 characters per message and a 24,000-character total budget. Additional part-query limits can also truncate the preview. The detail response identifies truncation. This preview is not a complete transcript or export.

Session summaries use recorded model and provider information when present. If a session lacks that metadata, the backend may fill it from the latest assistant message. Token totals are shown only when a nonzero total can be computed from the stored input, output, reasoning, cache-read, and cache-write fields; otherwise the value is unavailable.

All groups are derived from each session's recorded working directory, independently of OpenCode project IDs and display names. Group keys normalize Windows separator, trailing separator and case differences without requiring the directory to exist. The heading uses the folder basename and shows the full path underneath. Sessions in the same directory share a group; identically named folders at different paths remain separate. Database project rows without sessions do not produce empty groups. The launch directory remains the original selected session directory.

## User preferences and UI state

Search, selection, pagination, and current loading state belong to the UI. View preferences, including sort order, collapsed groups, child-session visibility, and per-project pinned session IDs, are stored in browser local storage inside the desktop webview. They are separate from the OpenCode database and are not session content.

The explorer initially shows 20 sessions per expanded project group and loads additional sessions in increments of 20. Child sessions, identified by `parentId`, are hidden by default; the Show child sessions preference is remembered. Filtering applies across project name and path, session title and ID, recorded directory, model, and provider. Search temporarily expands matching groups without changing the saved collapsed state. Multiple sessions can be pinned within each project; pinned sessions appear first within that project, with sessions ordered by recent activity. Filters apply to pinned sessions too.

The catalog retains all sessions, including hidden children. Project deletion uses this raw catalog rather than the filtered view, and its confirmation discloses hidden children included in the deletion. This preserves the full deletion scope even when child sessions are not displayed.

## Session launch flow

1. The UI requests a launch for a selected session and a tab or window mode.
2. The backend validates the session ID and looks up its recorded working directory in the database.
3. It verifies the directory exists and the discovered OpenCode CLI supports `--session`.
4. It constructs a PowerShell script that changes directory using literal-path semantics and invokes the resolved OpenCode executable with the selected ID.
5. The script is encoded as UTF-16LE and passed to PowerShell as an argument. Windows Terminal receives the argument vector, the PowerShell executable, and the encoded script. The working directory is not passed as Windows Terminal's raw starting-directory argument.
6. Tab mode targets the most recently used Windows Terminal window, not a guaranteed original window; window mode targets a new window.

The backend reports process dispatch, not successful session loading. OpenCode startup, plugin initialization, history rendering, and readiness for keyboard input happen in the separate terminal process. Errors after dispatch may only be visible in that terminal. Some child sessions may open in a history-oriented view rather than an editable prompt.

## Trust and privacy boundaries

Deletion requires a modal confirmation before IPC invocation. The backend checks existing session membership and refuses a selection that could cascade into unselected children. Complete selected sets are deleted leaf-first via the official CLI, with a fresh catalog after each operation because CLI exit success alone can conceal incomplete cleanup. Partial failures stop further deletion and return the actual remaining catalog. New sessions created after confirmation are not automatically added to the deletion set; concurrent native OpenCode changes should be avoided during deletion. Project deletion confirmation includes hidden child sessions from the raw catalog. Working folders and source files are never deletion targets.

- Session metadata and preview text are local data read from the user's OpenCode database. They may contain sensitive content and are not redacted by the manager.
- The manager does not upload session content or host a remote service. Opening OpenCode can still cause network activity initiated by OpenCode itself, including configured providers or plugins.
- Preview text is presented as plain text. It is not interpreted as HTML or Markdown and is not replayed as tool input.
- Opening a session launches locally installed `pwsh`, `wt`, and `opencode`. These programs and the OpenCode configuration remain outside the manager's trust boundary.
- A successful terminal launch request does not prove the selected conversation can be continued or that a model request will succeed.

## Compatibility and failure behavior

The database interface depends on the table fields and JSON shapes read from `session`, `message`, and `part`. It does not require the `project` table for directory grouping. OpenCode may change these shapes. If the required data cannot be read, catalog or detail loading can fail; the manager does not infer a replacement schema or repair the database. There is no fixed supported OpenCode version baseline. Runtime requirements are `opencode db path` and `--session`, plus `--pure serve` for renaming and compatible database fields.

Opening a session also requires Windows Terminal, PowerShell 7, and an existing recorded working directory. Initial discovery errors are cached until the manager restarts. A semicolon in the PowerShell executable path is rejected; a semicolon in a working directory is carried inside the encoded script. Terminal process creation is asynchronous and the app cannot guarantee that the TUI is ready.

## Release validation

For each release candidate, run the automated frontend and Rust checks documented in the [README](../README.md) and build the Windows application. Then verify the installed artifact through the actual desktop surface: installer install and uninstall, application startup, discovery against a compatible database, catalog refresh, selection and preview, and launching in both a tab and a new window. Verify that the native TUI can receive interactive input when the session type supports it. If artifacts are signed, verify the published signature and installation behavior. A build, unit test, or process-dispatch receipt alone does not validate the full release flow.
