# Interface regression checks

Verified on 2026-10-31: 120 Bun tests, 21 Chromium workflow tests, production build, TypeScript checks, and dependency auditing at high severity.

The Playwright suite uses the real Bun/Express controller, server-issued sessions, and a disposable SQLite database. It runs at an ordinary HTTP hostname where `crypto.randomUUID` and the modern Clipboard API are unavailable. Test data, credentials, and repositories are isolated from the running application.

| Area | Coverage |
| --- | --- |
| Systems | Create and edit persisted records; validation errors preserve input and allow retry; connection errors; deployment rejection; delete confirmation |
| Identities | Encrypted-key import with correct/incorrect passphrases; file upload; deletion; assigned-key deletion guard |
| Storage | SFTP creation and edit with redacted credential preservation; connection result handling; delete; export/import of local storage |
| Jobs | Create/edit/delete; redacted repository passphrase preservation; logs; authenticated live events; opt-in scheduling validation |
| Restore | Snapshot error/retry; file-list error/retry; target validation; specific-file payload; completion state |
| Settings | Load saved configuration; rejected/retried saves; real active-database query; SSO validation, mode changes, HTTP clipboard fallback; account password change and session revocation |
| Data | Fresh exports; credential exclusion; invalid and valid imports; clear-session confirmation preserves server data |
| Managed clients | Enroll; one-time credential display; schedule update; queue; disable |
| Navigation | All pages at 320×568, 844×390, 768×1024, and 1440×900; search; mobile menu and Escape |
| Startup and setup | Controller outage/retry; wizard scrolling through every step; asynchronous initialization rejection preserves entered token |

Backend tests additionally verify real pinned SSH/SFTP authentication against a local SSH server, repository command argument boundaries, destination key permissions and cleanup, UTC cron matching and atomic minute claims, disabled legacy scheduling, API permissions, deletion guards, password verification/revocation, and real backup statistics parsing. Existing lifecycle, interrupted-process, credential, and security regressions remain required.

Browser fixtures simulate snapshot/file/restore responses, live event delivery, selected service failures, and first-run wizard responses where deterministic state transitions are needed. These verify the interface and submitted payload, not a completed remote restore. Native transport command tests use controlled SSH/engine executables to verify generated transport and cleanup.

Real provider OAuth, AI provider calls, PostgreSQL deployment, Windows execution, and backup/restore against an actual Storage Box require separately provisioned integration environments. No production backup or restore is triggered by the browser suite. The controller workflow retains its container, local Restic, and pinned OpenSSH/SFTP integration jobs.

Run `bun test`, `bun run build`, `bunx tsc --noEmit`, and `bun run test:ui`. Install Chromium first with `bunx playwright install chromium` (CI also installs browser OS dependencies).
