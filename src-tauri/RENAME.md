# Session Rename Backend

`rename_session(session_id: String, title: String) -> Catalog` is registered as a
Tauri command. JavaScript invokes `rename_session` with `{ sessionId, title }`.
No frontend files are owned by this implementation.

## Mutation Boundary

- IDs must pass the existing session-ID validator and contain a suffix after
  `ses_`. Titles are trimmed, nonempty, at most 500 Unicode scalar values, and
  cannot contain control characters.
- Rename and deletion share `BackendState::mutations`. Existing deletion
  selection, child-session protections, and CLI behavior are unchanged.
- `Repository` still opens SQLite read-only and query-only. Rename never issues
  SQL writes. It sends only `{ "title": ... }` through the official authenticated
  `PATCH /session/{sessionID}` API, then rereads the repository for the returned
  catalog and requires the title to be visible there.
- The selected directory must exist. All API calls include its URL-encoded
  `directory` context. Before mutation, `/path` and the remote session's ID,
  project ID, canonical directory, creation time, and current title must match
  the repository. Windows slash differences are compared as canonical paths.
- Before starting the server, the same discovered executable runs
  `--pure db path` in the selected directory with the inherited data environment.
  Its canonical database path must match discovery. OpenCode 1.19.0 `/path` does
  not expose the database path, so this is an executable/environment contract,
  not a server-side database attestation. A concurrently replaced executable or
  hostile same-user process is outside this boundary.

## Transport And Lifecycle

- Each rename starts a fresh `opencode --pure serve --hostname 127.0.0.1
  --port <ephemeral-port> --mdns=false`. There is no persistent service and no
  attachment to an existing unauthenticated server. An OS-assigned port is
  reserved briefly then released for OpenCode; a bind race fails closed, without
  retrying or falling back to another service. The startup endpoint must match
  the selected port and literal IPv4 loopback host.
- Each child receives a fresh random 128-bit username and 256-bit password via
  child-only environment overrides. Credentials are not command-line arguments,
  returned errors, request URLs, or logs. Every request uses HTTP Basic auth.
  Parent environment and user configuration files are not modified.
- The HTTP client disables proxies and redirects, binds its local side to
  loopback, limits connect time to 2 seconds and each request to 10 seconds, and
  bounds decoded response input to 65,537 bytes. Error responses are not echoed.
- Server stdout is continuously drained on an owned thread; stderr goes to the
  null device, avoiding pipe deadlocks and accidental secret logging. Database
  discovery output is bounded and drained as well. Startup waits at most 30
  seconds; database discovery waits at most 15 seconds.
- An RAII process guard kills and reaps the directly spawned executable and
  joins its stdout reader on normal return, validation/API errors after spawn,
  startup timeout, or Rust unwinding. The verified `--pure serve` path is a direct
  executable, not a shell shim, and does not create a child server wrapper.
  Forced termination of the desktop process or OS failure bypasses Rust Drop;
  Windows job-object crash containment is not implemented. OpenCode's own
  initialization may perform official schema migrations; the manager does not.
- Normal Tauri exit is coordinated through `RunEvent::ExitRequested`, before
  Tauri's event loop calls `process::exit`. A shared mutex/condition-variable
  lifecycle atomically closes mutation admission and wakes queued rename/delete
  requests, which fail without starting their closures. The active mutation is
  allowed to finish, including its owned server kill/reap and stdout join.
  While active, `prevent_exit()` defers all exit requests. One blocking waiter
  requests exit again only after the active closure has returned or unwound;
  the second exit callback allows exit because the lifecycle is drained. The UI
  thread never waits on the mutation. An idle exit closes admission immediately.
  Lifecycle failures prevent exit rather than bypassing cleanup. This does not
  cover forced termination, crashes, or foreign calls to `process::exit`.
- `--pure` disables external plugins, not all OpenCode network activity. The
  API client only addresses loopback, but upstream CLI initialization is trusted.
- PATCH is not retried: a transport timeout can mean the update already applied.
  Errors ask the user to refresh before retrying. The app lock cannot serialize
  other OpenCode instances; a title changed after the preflight can be overwritten
  because the official endpoint has no compare-and-swap title contract.

## Reproducible Isolated Evidence

Run from the repository root:

```powershell
cargo build --locked --manifest-path src-tauri/Cargo.toml --bin rename_smoke
pwsh -NoProfile -File scripts/rename-api-smoke.ps1 -BackendSmoke src-tauri/target/debug/rename_smoke.exe
```

The script creates unique sandbox HOME/USERPROFILE, XDG data/config/cache/state,
APPDATA and LOCALAPPDATA directories. Only child process environments change.
It refuses a discovered DB outside that sandbox, checks unauthenticated `/doc`
returns 401, reads authenticated OpenAPI `session.update`, creates a synthetic
session, PATCHes a Unicode/quoted title, and reads it back. The optional Rust
driver independently enforces sandbox paths, pauses an admitted synthetic rename
at a channel barrier, requests shutdown, verifies later mutations are rejected,
then releases the real rename and waits for drain before accepting exit. It
checks its returned catalog and empty-title rejection, and the script observes
the final title through the API. Finally it terminates its owned server and
deletes the sandbox. No existing user session or database is mutated.

Installed OpenCode 1.19.0 was verified with this procedure. Its response field is
`projectID` (not `projectId`), and its stored directory uses forward slashes even
when the API returns Windows backslashes.

The shutdown driver exercises the same lifecycle used by desktop commands, not
an actual window-close event. A separate process test holds an owned long-lived
synthetic server during shutdown and proves its PID is gone before exit becomes
eligible. No production delay or shutdown-only mutation hook is added.
