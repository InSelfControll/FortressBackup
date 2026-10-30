# Fortress Backup

Fortress is a self-hosted backup controller with a React interface and a Bun/Express backend. It supports Borg and Restic backup workflows, with Rsync and Rclone integrations and AI-assisted configuration also present in the project.

Rsync, Rclone, and AI-assisted configuration have not completed the verification and stable testing recorded in `TODO.md`. Managed Windows clients are pre-production and retain the limitations listed below.

## Run locally

### Prerequisites

- Git
- Bun. The production Dockerfile currently uses Bun 1.4.4.
- Docker with Compose, only for container deployment

The default SQLite setup does not require a separate database server.

Set `FORTRESS_BOOTSTRAP_TOKEN` to a random value of at least 32 characters in the environment used to start Fortress. Keep this value private. The first-run setup wizard requires the configured bootstrap token.

```bash
git clone https://github.com/InSelfControll/FortressBackup.git
cd FortressBackup
bun install
bun run dev
```

To run the backend and frontend in separate terminals, use:

```bash
bun run dev:server
bun run dev:frontend
```

Open `http://localhost:9001` and complete the first-run setup wizard. Setup generates protected runtime configuration in the persistent data location. Preserve and restrict access to that configuration together with the database.

## Production with Compose

Use `Fortress.yaml` as the hardened Compose reference. It publishes Fortress only on loopback as `127.0.0.1:9001:9001`, runs as non-root UID/GID `1001:1001` with a read-only root filesystem, and mounts the `fortress-data` volume at `/app/data`.

Set a private, random `FORTRESS_BOOTSTRAP_TOKEN` of at least 32 characters before starting the stack. Compose refuses to start without it.

```bash
docker compose -f Fortress.yaml up -d --build
```

Open `http://localhost:9001` on the host. Non-local access requires a trusted TLS reverse proxy or a private access path. Do not publish port `9001` directly to an untrusted network.

## Security and recovery

- Persist `/app/data` and do not grant writable access to unrelated users. The container stores generated runtime configuration, including JWT and credential-encryption material, in `/app/data/.env`.
- Protect credential-encryption material and back it up independently. Losing it prevents decryption of stored credentials, so a database backup alone is not sufficient for recovery.
- Keep the bootstrap token and generated runtime configuration out of source control and public logs.
- Before production use, create a disposable repository and validate both backup and restore against it. Repeat restore validation after changes to repository, credential, client, or recovery configuration.
- Managed Windows executables, Restic, enrollment tokens, credential files, and local configuration require the protections described in the Windows guide.

## Managed Windows clients (pre-production)

Read [`agent/windows/MANAGED.md`](agent/windows/MANAGED.md) before enrolling a client. It is the canonical setup and operations guide.

Managed clients initiate outbound HTTPS polling to the controller, so they do not require inbound Windows firewall rules. Enrollment returns the client token once, while the controller stores its hash. Repository settings, source paths, credentials, SSH verification, and the Restic executable remain in locally protected Windows configuration. The controller can queue only the allow-listed `backup`, `check`, and `snapshots` operations.

Duplicate-execution safeguards include one in-flight job per client, execution leases, an active-job marker that requires operator intervention after interruption, and replay of unacknowledged completion reports.

The following production blockers remain:

- No full remote policy provisioning. Backup sources, repository destinations, and credentials are not centrally editable.
- No automatic enrollment-token rotation or client auto-update.
- No file-level managed-client restore interface.
- No completed end-to-end Windows VSS and Hetzner Storage Box restore test.

## Contributor guide

Read [`ARCH_README.md`](ARCH_README.md) for the internal architecture. The main source directories are `server/`, `client/`, `components/`, `src/routes/`, `agent/windows/`, `scripts/`, and `tests/`.

Run the controller CI-equivalent checks before submitting changes:

```bash
bun install --frozen-lockfile
bun audit --audit-level=high
bun test tests/managed-agents.test.ts tests/security.test.ts
bun run build
bunx tsc --noEmit
```
