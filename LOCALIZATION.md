# Localization

## Implementation Plan and Scope

Inspection found UI copy in App, the explorer, rows, menus, detail preview, dialogs, preferences and action hooks. Date helpers used browser defaults; explorer preferences rewrote an independent snapshot. The implementation follows this plan:

1. Cover system locale selection, saved override and immediate switching with regression tests.
2. Use typed central English/Chinese dictionaries and a small React locale context, without a new dependency.
3. Persist language separately from view preferences; update document language/title and localize formatting explicitly.
4. Translate UI labels, accessibility text, fallbacks, dialogs, notifications and explanations while preserving user content and diagnostic details.
5. Keep semantic message keys in async state so pending/completed operations render in the current language.
6. Verify both languages with full unit tests, typecheck, lint, production build and real browser fixture workflows.

## Contracts

- `src/i18n/messages.ts` defines the English keys and message-state type; `zh-CN.ts` must satisfy the complete dictionary.
- `src/i18n/locale.tsx` uses `navigator.language`: Chinese variants select `zh-CN`, everything else selects `en`. A valid stored override wins.
- Language uses `opencode-session-manager.locale`; explorer preferences retain their existing independent key. Switching does not remount the explorer or dialogs.
- User titles, preview text, paths, IDs, model/provider values and technical error details are never translated. Known backend error prefixes select localized explanations; the full original diagnostic is retained without string substitution.
- Native launch receipts have one exact known format; only session ID and dispatcher PID are extracted. The localized notice always warns that session resume/readiness is unconfirmed.
- Use the existing dark design and CSS tokens. The narrow header stacks the language label over its native select so the refresh control remains inside the viewport.

## Verification Recipe

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` before browser QA. Run `node src/test/browser-qa.mjs` for English and `$env:SESSION_MANAGER_QA_LOCALE='zh-CN'; node src/test/browser-qa.mjs` in PowerShell for Chinese.

The fixture QA uses production Vite preview and a fresh Edge context. It never reads or mutates real sessions. Each run writes 33 PNGs into a unique `session-manager-<locale>-*` directory under the system temp directory: nine workflow states plus 390/1440/1920 widths in actual light/dark app themes, each with normal, scrolled-end, rename and delete views. Theme selection is also checked for persistence and system-setting changes.

Covered workflows include language selection/persistence, child visibility, pinning, lazy detail refresh, plain-text previews, rename validation/failure/retry, tab/window dispatch, clipboard, directory opening, pagination, filtering, collapse/expand, and delete cancellation/confirmation. Unit regressions also cover locale changes while requests are pending and recovery from blocked preference writes. This is not native desktop/WebView2 or actual terminal readiness verification.
