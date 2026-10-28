# OpenCode Session Manager

A Windows desktop app for browsing and searching local OpenCode sessions, viewing metadata and limited text previews, and opening selected sessions via Windows Terminal using the native OpenCode CLI. Browsing is read-only by default; official CLI is invoked after delete confirmation. It complements the OpenCode TUI, does not replace or embed it.

This project is released under the [MIT License](LICENSE).

## Download and Installation

Download the Windows x64 `OpenCode Session Manager_<version>_x64-setup.exe` and `SHA256SUMS.txt` from [GitHub Releases](https://github.com/yhl10000/opencode-session-manager/releases/latest). Before the first official release, this page may not have installers available.

The installer is not code-signed, and Windows SmartScreen may show a warning. Please confirm the download source is trustworthy, and use PowerShell's `Get-FileHash -Algorithm SHA256` to compute the installer hash and compare it with the hash of the same-named file in `SHA256SUMS.txt`. The hash is used to verify file integrity, not to verify publisher identity.

The installer uses Tauri's default WebView2 download bootstrapper: if WebView2 Runtime is missing, it needs to be downloaded and installed online. PowerShell 7, Windows Terminal, and OpenCode CLI are not bundled with the installer; install them separately and make sure they can be found via `PATH`. See below for full requirements.

## Features

- Light, dark, and system theme modes, switchable instantly and remembering your choice; dark mode is retained by default.

- Supports Simplified Chinese and English. On first launch, the language is chosen by system language (Simplified Chinese for Chinese, English for other languages), and can be switched instantly via the top language menu. Language is stored locally and does not affect filtering or pinned preferences. Dates and relative times change with language; session titles, content, paths, models, and technical error details remain in their original text.

- Group sessions by their working directory, using the folder name as the title, not the project name from the OpenCode database; full paths distinguish same-named folders.
- Groups can be expanded, collapsed, and paginated independently, and all groups can be collapsed or expanded with one click; batch expand/collapse preserves selection and pagination, and is disabled during search.
- Child sessions are hidden by default; can be toggled to show, and the app remembers this preference. Hidden child sessions remain in the original directory data, and deleting a project includes them in the confirmation.
- Projects and sessions have delete buttons on the right, requiring double confirmation. Deleting a project removes all sessions in that directory group; when the last session is deleted, the group disappears; folders and source code files are not deleted.
- Open a project's working directory in Windows Explorer from its header, even when the group is collapsed.
- Search project names, session titles, session IDs, paths, models, and providers. Matching project groups are automatically expanded during search.
- Pin multiple sessions per project; pin state is stored in local browser preferences, pinned sessions appear first within their project, and the remaining sessions are sorted by recent activity. Filter conditions apply to pinned sessions too.
- Sort by recent activity time or project name.
- Rename sessions. On demand, an authenticated local OpenCode `--pure serve` is started, session titles are updated via HTTP `PATCH` requests, and the service process is stopped when done.
- View session metadata, message count, available models and providers, parent sessions, available token summaries, and limited read-only text previews.
- Open sessions in a new Windows Terminal tab or window, copy session ID, open session directory, and refresh directory or selected details.

The app does not support exporting full conversations, replaying tool calls, or directly editing the OpenCode database. Deletion is performed via `opencode --pure session delete`, avoiding maintenance commands initializing external plugins; renaming is similarly done via the native service provided by the official CLI, without writing directly to the database. Normal TUI startup preserves the original configuration. Data flow and trust boundaries are described in [Architecture Overview](docs/architecture.md); UI conventions are described in [Design Notes](DESIGN.md).

## Requirements

Running the desktop app requires:

- Windows 11.
- WebView2 Runtime.
- PowerShell 7 (`pwsh`) and Windows Terminal (`wt`), both discoverable via `PATH`.
- OpenCode CLI (`opencode`), discoverable via `PATH`; the CLI must provide the `db path` command and `--session` parameter. Renaming additionally requires CLI support for `--pure serve`.

The app discovers the database location via `opencode db path`. OpenCode's database schema may change; compatibility depends on the table fields and data formats the app reads. The project does not pin a specific OpenCode version baseline.

Development and building additionally require Node.js and npm, Rust toolchain with Cargo, Visual Studio C++ build tools with MSVC, and other [Tauri 2 Windows development dependencies](https://v2.tauri.app/start/prerequisites/#windows).

Runtime commands can be checked in PowerShell 7:

```powershell
pwsh --version
wt --version
opencode --help
opencode db path
```

Confirm OpenCode help info contains `--session` and `--pure serve`, and that `opencode db path` returns an existing database file.

## Development and Testing

After entering the repository root in PowerShell 7, run:

```powershell
npm ci
npm run tauri dev
```

Run frontend checks and Rust tests:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
node --test scripts/release-utils.test.mjs
node scripts/release-utils.mjs validate
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
npm audit
```

## Building

Run the Windows desktop build from the repository root:

```powershell
npm run tauri build -- --bundles nsis -- --locked
```

Tauri CLI writes the executable and configured installer to `src-tauri/target/release/`. You can also launch the executable directly:

```powershell
& ".\src-tauri\target\release\opencode-session-manager.exe"
```

## Usage

1. Launch the desktop app. The app discovers OpenCode and reads local session directories; child sessions are hidden by default.
2. Expand project groups, or search by title, project, ID, path, model, or provider. Project groups show one page of sessions first, and can be loaded further individually. Show child sessions when needed, or pin multiple sessions within a project; these display preferences are stored locally.
3. Select a session to view metadata and text preview. Use the refresh button to re-read the directory or selected details.
4. Double-click a session or use the action menu to request OpenCode open it in a new Windows Terminal tab or window. The details panel also provides these actions and an option to open the session directory.

The manager launches sessions using the session's recorded working directory and OpenCode CLI's `--session` parameter. The selected session and directory must still exist. Dispatch success only means Windows Terminal accepted the launch request, not that the OpenCode TUI is ready or the session can receive input. Some child sessions may show a history view instead of an editable prompt.

## Security and Privacy

- The session database connection is opened in read-only and query-only mode. The manager does not write to the database or modify the schema; deletion calls OpenCode's official commands, and renaming sends HTTP `PATCH` requests through a temporarily started, authenticated local OpenCode service. The manager stops its started service process after the operation.
- Directories and details are read locally. The manager does not provide cloud services or upload session data. After launching OpenCode, OpenCode or its configured providers, plugins may still initiate network connections.
- The directory reads session metadata. Text is read on demand only when viewing details, at most 40 messages, 4,000 characters per message, 24,000 characters in total; other query limits may also cause preview truncation.
- Previews are displayed as plain text, not full exports, do not replay tool calls, and are not treated as executable instructions.
- Session titles, paths, previews, and copied IDs are not redacted and may contain sensitive information. Protect them as you would protect other local OpenCode data.
- When opening a session, the manager launches local `pwsh`, `wt`, and `opencode`. Use trusted installations and pay attention to content displayed in new terminals.

## Limitations

- The official delete command recursively deletes child sessions. Single session deletion is rejected when child sessions exist; delete child sessions first. Directory batch deletion is also rejected if it involves unselected child sessions. Batch deletion may partially succeed; the UI reports errors and shows actual remaining data. Do not continue creating or modifying related child sessions in other OpenCode windows during deletion.
- OpenCode's database schema and JSON format may change. The app depends on the table fields and data shapes it currently reads; if incompatible, directory reading may fail and the manager will not attempt to repair the database.
- Opening a session requires its recorded working directory to still exist and OpenCode CLI to support `--session`.
- Windows Terminal launch is asynchronous. A dispatched request does not mean the TUI has loaded successfully; errors after launch may only appear in the terminal.
- Some child sessions open in a history view rather than an editable prompt.
- PowerShell executable paths containing semicolons are not supported. Semicolons in project working directories are passed via encoded PowerShell commands, not as raw Windows Terminal startup directory parameters.
- The app process caches the initial OpenCode discovery result. Restart the app after modifying `PATH` or fixing discovery errors.
- Previews are intentionally length-limited and not suitable for viewing or exporting full conversations.

## Troubleshooting

If sessions cannot be loaded, confirm the environment launching the app can find `opencode` via `PATH`, that `opencode db path` points to an existing and readable file, and that the database format is compatible. Restart the app after modifying `PATH` or fixing discovery errors.

If Windows Terminal does not open the selected session, confirm `wt`, `pwsh`, and `opencode` are all discoverable via `PATH`, OpenCode help info contains `--session`, and the session working directory still exists. Check errors in the new terminal. The manager can report dispatched requests but cannot confirm whether the TUI is ready.

If the desktop window is blank or cannot start, check WebView2 Runtime and Tauri Windows development dependencies. In development mode, check the terminal output of `npm run tauri dev`.

## Release Verification

GitHub Actions `Windows Release` workflow builds and publishes Windows x64 NSIS installers when `vX.Y.Z` tags are pushed. Only stable versions without leading zeros are accepted; pre-releases and build metadata are not accepted. The workflow uses Windows Server 2022, Node.js 24, and Rust stable, runs frontend checks, fixture tests, Rust tests, and Clippy, then builds the installer.

Running `workflow_dispatch` manually **builds only, does not create a Release**. Before the first release, run the workflow manually in Actions to confirm the cloud build succeeds; artifacts `windows-x64-nsis` are retained for 7 days and can be downloaded for installation verification. CI does not install or invoke real OpenCode, nor read real session data; fixture tests cannot prove the native TUI is interactive.

Release workflow order:

1. Synchronously update app versions in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`; use package management tools to sync `package-lock.json` and `src-tauri/Cargo.lock` with app versions themselves; do not manually edit dependency lock contents.
2. Run all checks and `node scripts/release-utils.mjs validate vX.Y.Z` (replace `X.Y.Z` with the version to release), commit and push changes. Run manual cloud build first and verify downloaded installers.
3. Create and push a tag from the verified commit. For example, the first version:

```powershell
node scripts/release-utils.mjs validate v0.1.0
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

The workflow only uploads verified single installers and `SHA256SUMS.txt`. The release job re-verifies the file manifest, filenames, and SHA256, then creates a draft release with full assets and publishes it, without using personal access tokens. Same-named existing Releases are rejected for overwriting; upload or publish failures may leave drafts, maintainers must check failure reasons and cannot retry by overwriting published versions. Do not move or reuse release tags.

Before release, run the above frontend and Rust checks and build the Windows app. Also verify user-facing flows using the actually installed program: install and uninstall, app launch, database discovery, session browsing and detail preview, and both terminal launch modes. Check whether the native TUI remains interactive. If the release flow signs artifacts, also check signatures and installation behavior of signed artifacts. Build success or dispatched terminal requests alone do not prove the full release process works.
