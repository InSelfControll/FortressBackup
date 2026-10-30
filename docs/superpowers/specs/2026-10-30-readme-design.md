# Fortress README redesign

Date: 2026-10-30
Source revision: `ba1992891d0d56cd568253f916b24485751e5136` (`origin/main`)

## Purpose

Rewrite `README.md` for operators and contributors. The document must help an operator install and protect Fortress, then help a contributor locate architecture guidance and run the repository's Bun verification commands. Replace promotional or unsupported claims with statements grounded in current source and shipped documentation.

## Scope

Change only `README.md` during implementation. Keep the security audit and its artifacts separate. Do not change application behavior, deployment files, agent code, or other documentation.

## Audience and structure

Use an operations-first structure:

1. Project name and concise description of the backup controller.
2. Current capabilities and maturity, including Borg, Restic, Rsync, Rclone, AI configuration, and managed Windows clients only to the extent supported by current source and documentation.
3. Prerequisites and Bun-only local setup.
4. First-run setup at `http://localhost:9001`, including the bootstrap-token requirement.
5. Production deployment using `Fortress.yaml` as the hardened Compose reference, with loopback or TLS-proxy access, persistent `/app/data`, and protection and independent backup of encryption material.
6. Managed Windows client guidance through `agent/windows/MANAGED.md`, preserving its pre-production and restore-validation limitations.
7. Security and recovery notes limited to implemented controls and documented operator responsibilities.
8. Contributor guidance with links to `ARCH_README.md`, relevant source directories, and CI-equivalent Bun commands.

## Content rules

- Use Bun for every JavaScript installation, build, test, and type-check command.
- Do not use npm commands.
- Do not claim compliance, zero trust, production readiness, performance, or testing outcomes without repository evidence.
- Label managed Windows support as pre-production and preserve the need for a real VSS backup and restore test.
- Identify Rsync, Rclone, and AI-assisted configuration according to the repository's recorded verification status rather than presenting them as fully validated.
- Do not add screenshots, badges, logos, testimonials, metrics, or other new assets.
- Use direct, concise copy without em dashes or marketing buzzwords.

## Command and reference sources

- `package.json`: development, server, build, start, and preview commands.
- `.github/workflows/fortress-controller.yml`: Bun install, audit, targeted tests, build, and type-check commands.
- `Fortress.yaml`: hardened production Compose defaults and required bootstrap token.
- `docker-compose.yaml`: alternative SQLite or PostgreSQL deployment settings, only if needed and clearly distinguished from the hardened stack.
- `agent/windows/README.md` and `agent/windows/MANAGED.md`: Windows build, enrollment, operation, and production limitations.
- `ARCH_README.md`: contributor architecture reference, with outdated statements avoided in the README summary.
- `TODO.md`: recorded verification gaps for AI, Rsync, and Rclone.

## Error and recovery guidance

Explain that losing the persistent credential-encryption material prevents decryption of stored credentials. Direct operators to protect the data volume, keep independent protected backups of key material, and validate backup and restore against a disposable repository before production use. Do not imply that application backups replace encryption-key backup or restore testing.

## Verification

Before delivery:

1. Compare every command, port, path, environment variable, feature statement, and link with the cited source.
2. Check that all Markdown links resolve to existing repository files or intended external destinations.
3. Confirm that no npm command, unsupported claim, em dash, placeholder, or new asset entered the README.
4. Run the existing CI-equivalent Bun tests, frontend build, and TypeScript check on the final worktree when the audit execution-safety controls permit them. Report any check that cannot be run and why.
5. Review the final diff to confirm that implementation changed only `README.md`, apart from this approved design and planning material.
