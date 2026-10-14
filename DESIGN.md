# Interface Design

## Product character

The interface is a quiet desktop workbench for finding and reopening OpenCode sessions. It favors a continuous project explorer, legible technical metadata, restrained surfaces, and a clear launch action. It is a local utility, not a dashboard or a replacement for the OpenCode TUI.

The application uses a dark color scheme regardless of the operating system theme. Color distinguishes hierarchy and state without making selection or status depend on color alone.

## Visual tokens

### Color

| Role | Token | Value |
| --- | --- | --- |
| Canvas | `--canvas` | `#101316` |
| Panel | `--panel` | `#15191d` |
| Elevated surface | `--elevated` | `#20262c` |
| Inset surface | `--inset` | `#11161a` |
| Primary text | `--text` | `#edf1f4` |
| Secondary text | `--secondary` | `#bec8d0` |
| Muted text | `--muted` | `#93a2ad` |
| Border | `--border` | `#303b44` |
| Subtle separator | `--subtle` | `#252e35` |
| Hover | `--hover` | `#222b32` |
| Selected | `--selected` | `#2b3943` |
| Accent | `--accent` | `#78d8c5` |
| Accent hover | `--accent-hover` | `#99e5d6` |
| Accent text | `--accent-ink` | `#102721` |
| Informational | `--info` | `#97c8fa` |
| Success | `--success` | `#9ce0be` |
| Error | `--error` | `#ffb4ac` |
| Warning | `--warning` | `#e8cd98` |

### Type and spacing

Use Segoe UI Variable, Segoe UI, or the system sans-serif fallback for interface text. Use Cascadia Code, Consolas, or a system monospace fallback for paths and identifiers. The type scale is 12, 14, 16, 20, and 28 pixels, with comfortable line height for body and preview text.

Spacing follows a 4-pixel base. The available spacing tokens are 4, 8, 12, 16, 20, 24, 32, 40, 48, and 64 pixels. Use 4, 6, and 8-pixel radii for rows, controls, and menus. Keep borders thin and focus rings prominent.

## Layout

The application shell fills the viewport and keeps the header and status footer visible. The workspace has a project and session explorer beside a flexible detail pane. Each pane owns its content scrolling, preventing the page shell from becoming a competing scroll container.

At narrow widths, the panes stack vertically. The explorer remains bounded so the detail pane can be reached without losing its own scroll behavior. Keep project groups in a continuous explorer rather than introducing a separate project-navigation gate.

## Components and behavior

- **Explorer:** Search across project name, title, ID, path, model, and provider. Every whitespace-separated, case-insensitive query term must match. Sort by activity or project name. Groups are independently collapsible and reveal sessions incrementally. Search expands matching groups without overwriting saved collapsed-group preferences.
- **Session row:** A native button selects a session and exposes its title, model when available, message count, optional token total, and relative activity time. Double-click requests opening in a terminal tab. Provide an explicit actions button and keyboard access to the contextual menu.
- **Session menu:** Offer tab and window launch, copy ID, and open working directory. Support keyboard navigation, Escape, outside dismissal, and focus return to the invoking control.
- **Detail pane:** Show available session metadata and a bounded, read-only plain-text preview. Do not interpret preview content as HTML or Markdown. Fetch detail on selection and avoid replacing newer selection data with a stale response.
- **State panels:** Provide clear loading, error, empty, no-results, and desktop-required states. Errors use an alert role and offer retry when appropriate. Do not show synthetic runtime sessions.
- **Status footer:** Identify local database status and available catalog metadata. Long paths may be truncated visually while remaining available as text.

## Interaction and accessibility

Use brief opacity feedback rather than ornamental motion. Respect reduced-motion settings. Controls need clear hover, pressed, disabled, pending, and keyboard-focus states. Keep interface actions as native buttons, label search and sort controls, announce status changes, and distinguish selection with both surface treatment and an icon.

Technical paths and IDs should remain selectable and wrap safely, including CJK text. Preview text should remain readable and clearly bounded. Target WCAG 2.2 AA, including visible keyboard focus and sufficient contrast.

Launch feedback means the request was dispatched, not that OpenCode finished loading or is ready for input. Clipboard actions should report whether the copy operation succeeded. On transient refresh failure, retain previously loaded metadata and allow retry.

## Design tokens and implementation

The canonical CSS variables live in `src/styles/tokens.css`. Keep visual values traceable to those tokens and preserve the keyboard and screen-reader behavior when changing components. For database access, terminal dispatch, and data boundaries, see [Architecture](docs/architecture.md).
