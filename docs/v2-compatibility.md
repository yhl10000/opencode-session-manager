# OpenCode V2 compatibility review

Review baseline: Windows, OpenCode v2.2.5, 2026-11-04. This covers the manager's existing features, not new OpenCode features such as archiving or fork management.

## Feature and evidence map

| Existing feature | Review and regression coverage | External boundary |
| --- | --- | --- |
| Discover CLI/database; load/refresh catalog | V1/V2 version and help formats; V2 alias comma; mixed database table precedence; empty V2 never falls back to stale V1 | Native smoke uses the installed CLI and a private V2 database |
| Session metadata, model/provider, tokens, parent sessions | V2 schema fixtures cover nullable title/model/provider, assistant model fallback, usage totals and parent IDs | Native smoke reads API-created V2 sessions through the real repository |
| Bounded text preview | V2 message type/sequence, direct user text, assistant text-part ordinal, exclusion of tool/reasoning content, malformed JSON and Unicode budgets | Repository fixtures cover nonempty history; native smoke imports synthetic history without model calls |
| Directory grouping and Explorer paths | Normalized Windows paths, distinct same-named folders, drive roots, missing directories and slash conversion | Native smoke checks real sandbox directory round trips; unit tests do not claim Explorer-window readiness |
| Double-click, tab/window actions and menus | Real `discover()` to `launch()` regression in isolated subprocesses, V1/V2 CLI fixtures, tab/window dispatch arguments and rejection before dispatch; real PowerShell literal-path test | Synthetic terminal executables verify dispatch, not an interactive OpenCode TUI |
| Rename, trim/validate title, refresh after rename | V2 fixed Basic username, random password, private serve startup prefixes, session identity/envelope/location validation, PATCH 204, errors and persisted title verification; V1 retained | Native smoke calls the real rename function against an authenticated installed V2 service |
| Delete session/project, confirmation/cancel and partial retry | Complete selection, hidden/unselected child protection, leaf-first deletion, partial failures, changed DB refusal, missing-directory fallback, V1/V2 commands and deletion error category | Native smoke verifies actual CLI deletion and absence of a shared service registration |
| Fork relationship safety | V2 upstream remove traverses `parentID`, not fork source; a synthetic imported session can be forked without sending prompts | Native probe confirms the fork survives deletion of its source, then cleans both probe records |
| Search, filtering, sorting, group pagination and collapse | Catalog/Explorer/session-feature tests and browser workflows | Uses the same catalog DTO for V1 and V2 |
| Show children, pins and saved preferences | Default-hidden child sessions, independent pins, preference restoration and filtering interactions | Local browser preferences remain independent of OpenCode's database |
| Selection, metadata refresh and asynchronous results | Stale detail/catalog results cannot overwrite current selection or a successful rename; deleted selections are cleared | Frontend tests model delayed IPC results explicitly |
| Copy ID and open-directory actions | Request parameters, success/failure notifications and browser clipboard workflow | Browser clipboard is exercised; native Explorer dispatch and system clipboard remain separate OS boundaries |
| Locale, theme, version and accessibility | Existing localization/theme/version tests, keyboard menu/dialog focus tests, bilingual browser workflows and V2 optional-field/role fixtures | Browser QA uses fresh Edge contexts and synthetic IPC, never real sessions |

## Defects repaired

- V2 help advertises `--session, -s`; exact whitespace-token matching incorrectly rejected the capability before Windows Terminal was started.
- Rename retained V1 `--pure`, `--mdns`, configurable auth username, startup prefix, route and JSON-response assumptions. The V2 branch now uses its actual CLI/auth/API contracts, while retaining V1 behavior.
- Delete retained V1 help syntax and `--pure`. V2 now uses `--standalone`, checks the database path before execution and verifies actual removal afterward.
- Running deletion from a missing session directory would fail before the CLI could delete that stale session. The command now falls back to the discovered database's parent directory without removing the DB-identity check.
- Delete-process failures no longer carry an unrelated rename error category.

## Repeatable checks

Run the frontend/Rust checks in the README. For the actual installed V2 boundary:

```powershell
cargo build --locked --manifest-path src-tauri/Cargo.toml --no-default-features --bin v2_smoke
& .\scripts\v2-native-smoke.ps1
```

The smoke creates an authenticated loopback server and a random sandbox with separate HOME, XDG and Windows data directories. It imports a synthetic user message for the fork probe, then exercises the public application functions on synthetic sessions. It checks read-only database access, exact database/workspace containment, API results and private-service behavior before cleaning up. It never prompts a model or mutates existing user sessions.

Browser workflows can be rerun after `npm run build`:

```powershell
node src/test/browser-qa.mjs
$env:SESSION_MANAGER_QA_LOCALE = 'zh-CN'
node src/test/browser-qa.mjs
Remove-Item Env:SESSION_MANAGER_QA_LOCALE
```

## Boundaries

- A dispatch receipt is not evidence that Windows Terminal/OpenCode is interactive. The automated launch regressions exercise real discovery and process dispatch with controlled executables, not a submitted model conversation.
- Do not create or modify related child sessions concurrently in another OpenCode client during confirmed deletion. The API does not expose a conditional recursive-delete transaction for the manager's selection snapshot.
- V1 behavior is regression-tested with fixtures; the installed native baseline for this review is V2.2.5. Future OpenCode CLI/API changes require re-running the native smoke.
- No dependencies or lockfiles were changed in this repair. A fresh audit request to the corporate npm mirror returned HTTP 429; this is an unavailable audit result, not a fresh zero-vulnerability claim.

## Executed verification

- Frontend: 97 tests passed; lint, typecheck and production build passed.
- Rust: 66 tests passed; formatting and all-target/all-feature Clippy passed.
- Release utilities: 38 tests passed.
- English and Simplified Chinese Edge fixture workflows passed at widths 390, 1440 and 1920, with zero browser errors.
- Fresh installed-V2 native smoke passed, including authenticated rename, parent/child selection guards, single/batch deletion, fork survival and absence of shared-service registration.
- Desktop release executable built successfully at `src-tauri/target/release/opencode-session-manager.exe`. The frontend build retains two upstream Zod comment-annotation warnings; a warning-free frontend build is not claimed.
