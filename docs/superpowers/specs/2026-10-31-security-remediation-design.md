# Security remediation design

Date: 2026-10-31
Source revision: `1e16804` (`origin/main`, includes README PR #21)
Audit source: `/home/ofir/security-audit-skill/FortressBackup/run-2/findings.json`

## Goal

Validate and remediate the 33 source-grounded security leads in one phased pull request. Add regression coverage for every behavior change, use the smallest effective source changes, and preserve explicit unresolved records where a deployment or unavailable platform fact prevents validation.

## Delivery strategy

Use branch `fix/security-remediation` and one pull request with grouped commits for authentication/session, backup/credentials, browser/database, and deployment/Windows work. Each lead receives a final disposition: fixed with evidence, rejected with evidence, or still needing validation with the exact blocker. No lead is marked fixed solely because code changed.

## Shared engineering rules

- Use Bun for all JavaScript installation, execution, tests, builds, and type checks. Do not use npm or Node commands.
- Follow test-driven development: write a focused test, observe its expected failure on the unmodified branch, then implement the minimal fix and rerun it.
- Extend existing tests and project conventions. Do not add a new test framework or production dependency without first proving that the required capability is absent.
- Use dummy principals, secrets, databases, repositories, process fixtures, and isolated loopback only. Do not contact deployed systems, real providers, production data, or shared services.
- Preserve existing public API shapes except where the security invariant requires a new field or a deliberate rejection. Do not change unrelated code or address unrelated warnings.
- Do not mark Windows, deployment, provider, or external artifact behavior verified without appropriate evidence.

## Authentication and session remediation

### Authentication mode and account identity

Enforce persisted `auth_mode` in both the local-password and GitHub callback routes. Local-password login must be rejected in SSO-only mode, and GitHub callback must be rejected in local-only mode even when stale provider configuration remains.

Replace email-only existing-account assumption with explicit provider-subject binding. Existing accounts may be linked only after the current Fortress principal authenticates through a dedicated linking flow. A callback for an unlinked but matching email must not inherit the account or its role. Existing linked identities continue to authenticate. New users remain viewers except for the designated initial owner.

Make initial-owner elevation depend on the absence of an administrator and an owner-specific bootstrap condition, not the absence of every user. An unrelated first viewer must not prevent the pinned owner from becoming administrator.

### Logout and revocation

Add server-side revocation using a per-user authorization epoch or an equivalent minimal persisted session generation. Bind JWT verification to that generation. Logout invalidates the current user's existing tokens, and browser logout calls the server before clearing local state. Centralize client teardown so bearer storage, in-memory tokens, user state, query data, and secret-bearing configuration are all removed or rebound on logout and account switch.

### Admission and outbound request lifecycle

Add bounded login admission control that does not create an unbounded in-memory principal map. Add application deadlines, response-size limits, and cancellation for GitHub OAuth and direct OpenAI-compatible requests. Disable redirects for the OpenAI-compatible fetch rather than revalidating them after the fact. Preserve administrator authorization and existing provider configuration behavior.

Tests must cover SSO/local mode rejection, unlinked email collision, authenticated linking, first-viewer/second-owner ordering, revoked-token replay, login admission, redirect refusal, timeout, disconnect cancellation, and oversized provider responses.

## Backup and credential remediation

### Restore scope and job lifecycle

Forward selected restore paths to Borg and Restic builders. Reject an explicitly empty specific-file selection instead of converting it to a full-snapshot restore. Keep target-path and snapshot validation at the final trusted decision point.

Replace stale whole-row completion upserts with conditional updates limited to run-owned result fields and the active run. Reject conflicting edit/delete operations during an active run or otherwise preserve their changes atomically. Reconcile interrupted `Running` leases during startup and terminate complete local process groups on timeout or output overflow.

Propagate cancellation into snapshot/file listing and other request-bound command execution where the interface promises cancellation. Do not leave disconnected listing work until the six-hour deadline without an owner or cleanup path.

### Credential confidentiality and peer identity

Normalize repository-password aliases before the create/update encryption decision so every accepted field is sealed. Migrate legacy plaintext SSH private keys and passphrases to encrypted storage during resolution, matching the existing location/config migration pattern.

Bind Restic SFTP and local Rsync repository/source connections to an explicitly enrolled host public key and a generated restricted trust file. Do not rely on ambient `known_hosts` policy or a fingerprint used only as a syntax check. A mismatch must fail before repository data or credentials are exchanged.

Tests must cover selected and empty restores, stale completion interleavings, startup recovery, descendant cleanup, password aliases, legacy migration, wrong-peer rejection, and correct-peer acceptance with dummy fixtures.

## Browser and database remediation

### Browser authority and request destination

Use the shared same-origin API configuration for deployment requests, including bearer tokens and SSH passwords. Do not post credentials to a hard-coded loopback origin. Serve the authenticated UI with a restrictive `frame-ancestors` policy and compatible `X-Frame-Options` fallback unless current source already supplies an equivalent control.

Clear principal-independent query caches and secret configuration during login/logout transitions. Viewer sessions must not render or export administrator records or secrets retained from a previous session. Settings and data-management actions must also enforce the appropriate current role rather than relying only on server-side API denial.

### Database transport and filesystem

Require an explicit PostgreSQL TLS policy. Secure remote PostgreSQL connections by default, while any private isolated Compose exception must be explicit and documented rather than an ambient plaintext fallback.

Enforce restrictive ownership-compatible permissions on the SQLite directory, database, WAL, and shared-memory files for direct and container launches, including pre-existing files. Do not weaken container defaults or silently grant broader access.

Tests must cover administrator-to-viewer transitions, exported secret absence, deployment URL selection, framing headers, explicit PostgreSQL transport policy, and direct-launch SQLite modes.

## Deployment, script, and Windows remediation

- Publish maintained Compose variants on loopback by default and require an explicit secure proxy/private-path decision for non-local access.
- Pin container build inputs to verified immutable identities when those identities can be established. Do not invent digests. If verification is unavailable, retain the lead as unresolved.
- Replace the standalone landing page's mutable third-party script with reviewed local behavior or no script dependency.
- Create replication lock state in a private operator-owned directory with safe file creation rather than truncating a predictable shared `/tmp` path.
- Produce Windows agent artifacts only for trusted push events while retaining unprivileged pull-request tests. Recompute and compare the final agent digest immediately before upload, after all external tool execution.
- Bind installed Windows executables to the verified digest by checking the installed destination before task registration. Reset complete security descriptors on pre-existing installation objects so unrelated trustees and owners cannot retain write access.

Windows changes require appropriate Windows test evidence. Static inspection alone is insufficient for NTFS, Task Scheduler, VSS, and PowerShell claims. If that evidence is unavailable locally, the pull request must identify the remaining CI or owner-validation requirement rather than claiming completion.

## Lead disposition contract

This is the umbrella design for the phased pull request. Each phase receives its own implementation plan and review gate so the 33 leads are not treated as one undifferentiated patch. Across those plans, every audit fingerprint below must be tracked. No item may be dropped silently.

1. `agent/windows/install-task.ps1:acl-preservation`
2. `agent/windows/install-task.ps1:hash-copy-reopen`
3. `browser-deployment-hardcoded-loopback-credentials`
4. `client-account-switch-retains-secret-config-export`
5. `client-data-lifecycle:principal-independent-query-cache`
6. `client-session-logout-retains-bearer`
7. `deployment-compose-plain-http-exposure`
8. `docker-build-mutable-upstream-inputs`
9. `landing/index.html:unpinned-runtime-script`
10. `scripts/restic-replicate.sh:shared-lockfile-open`
11. `server/ai/openai-response-lifecycle`
12. `server/auth/github-callback-fetch-lifecycle`
13. `server/auth/login-bcrypt-admission`
14. `server/auth:github-callback-ignores-auth-mode`
15. `server/auth:github-email-implicit-account-link`
16. `server/auth:jwt-logout-replay`
17. `server/auth:local-login-ignores-auth-mode`
18. `server/auth:sso-owner-bootstrap-global-user-check`
19. `server/backup/listing-disconnect-orphan`
20. `server/backup/local-cancel-shell-only`
21. `server/backup/restic-sftp-ambient-peer-verification`
22. `server/backup/rsync-host-fingerprint-not-bound`
23. `server/backup:restore-selection-scope`
24. `server/db/postgres-transport-default`
25. `server/db/sqlite-file-permissions`
26. `server/index.ts:missing-anti-framing-policy`
27. `server/jobs/run-completion-stale-upsert`
28. `server/jobs/running-lease-no-recovery`
29. `server/jobs/update-repo-password-alias-plaintext`
30. `server/services/ai/generator.ts:openai-redirect-target-not-revalidated`
31. `server/ssh-keys/legacy-plaintext-not-migrated`
32. `windows-agent-artifact-event-provenance`
33. `windows-agent-post-build-tool-tampering`

## Verification and pull request evidence

For each group, record the failing-test command and expected failure before implementation, then the passing result after implementation. Finish with the complete Bun test suite, production build, TypeScript check, diff review, and independent security/code review. The pull request must include the lead disposition matrix and clearly separate local evidence, CI evidence, and remaining owner validation.
