<div align="center">

# 🛡️ Fortress Backup

**Your backup operations, brought together.**

A self-hosted controller for managing backup sources, storage destinations, and jobs from one web interface.

[![Controller CI](https://github.com/InSelfControll/FortressBackup/actions/workflows/fortress-controller.yml/badge.svg?branch=main)](https://github.com/InSelfControll/FortressBackup/actions/workflows/fortress-controller.yml)
[![Windows agent CI](https://github.com/InSelfControll/FortressBackup/actions/workflows/windows-agent.yml/badge.svg?branch=main)](https://github.com/InSelfControll/FortressBackup/actions/workflows/windows-agent.yml)
[![Built with Bun](https://img.shields.io/badge/runtime-Bun-14151a?logo=bun&logoColor=white)](https://bun.sh/)
[![Interface](https://img.shields.io/badge/interface-React-149eca?logo=react&logoColor=white)](https://react.dev/)

[Downloads](https://github.com/InSelfControll/FortressBackup/releases) · [Get started](#get-started) · [Configure a backup](#configure-a-backup) · [Storage Box](#hetzner-storage-box) · [Security & recovery](#security--recovery) · [Contributing](#development--verification)

</div>

---

## A clearer view of your backups

Fortress combines a React interface with a Bun/Express controller. Register a machine, connect a destination, and manage backup jobs without switching between separate tools for every task.

| | What you can do |
|---|---|
| **Sources** | Register systems, assign saved SSH identities, verify host keys, and deploy supported tools. |
| **Storage** | Configure SFTP, local/NFS, S3, and Backblaze B2 destinations for supported engines. |
| **Jobs** | Create Borg, Restic, or Rsync jobs, run them manually, or opt in to a UTC schedule. |
| **Recovery** | Browse Borg and Restic snapshots, select files, and restore them to a target system. |
| **Visibility** | View job status and logs, check SSH connections, and monitor recent activity. |
| **Administration** | Manage account security, GitHub SSO, configuration exports, and supported AI settings. |

> **Project status:** Rsync and AI-assisted configuration need further verification. Rclone is not available for new jobs. Managed Windows clients are pre-production; see their [limitations](#managed-windows-clients).

## Get started

### Option 1 · Local development

You'll need Git and Bun. The production image uses Bun 1.4.4. SQLite is the default database and does not require a separate server.

```bash
git clone https://github.com/InSelfControll/FortressBackup.git
cd FortressBackup
bun install

# Set a private, random token of at least 32 characters for first-run setup.
export FORTRESS_BOOTSTRAP_TOKEN="$(openssl rand -hex 32)"
bun run dev
```

Open **[http://localhost:3001](http://localhost:3001)** for the development interface. Vite proxies API requests to the controller on port `9001`. Enter the bootstrap token in the setup wizard; you can retrieve it in the same terminal with `printf '%s\n' "$FORTRESS_BOOTSTRAP_TOKEN"`.

To start the services separately, use `bun run dev:server` and `bun run dev:frontend` in terminals that have the bootstrap token available. Preserve the generated runtime configuration and database together.

### Option 2 · Docker Compose

The hardened [Fortress.yaml](Fortress.yaml) stack builds the production image, persists data in a named volume, runs as a non-root user with a read-only root filesystem, and binds port `9001` to localhost.

```bash
# Set this in a private environment before starting Compose.
export FORTRESS_BOOTSTRAP_TOKEN="$(openssl rand -hex 32)"
docker compose -f Fortress.yaml up -d --build
```

Open **[http://localhost:9001](http://localhost:9001)** and complete the setup wizard with the token. For access from another device, use a trusted TLS reverse proxy or a private access path. Do not expose the controller directly to an untrusted network.

If exactly one trusted reverse proxy connects to Fortress, set `TRUST_PROXY=1` in the controller environment so login admission uses the client address supplied by that proxy. Leave it unset for direct access or other proxy arrangements.

## Configure a backup

1. **Add a source.** In **Systems**, register the machine and import a private key into **Identity Vault**. Assign the identity and a verified SSH host public key to the source.
2. **Verify access.** Use **Check Connection** to verify SSH authentication and host identity. **Deploy Toolset** can install the selected supported engines.
3. **Add storage.** Create a destination in **Storage Locations**. Local/NFS paths must be mounted and accessible where the selected engine runs.
4. **Prepare the repository.** Initialize an encrypted Borg or Restic repository separately before the first backup, and save the same repository passphrase in the job.
5. **Create a job.** Choose the source, paths, destination, and engine. Run it manually or explicitly enable automatic scheduling.
6. **Verify recovery.** Test a backup and restore using a disposable repository before relying on the configuration.

SSH schedules use five-field cron expressions in **UTC**. The controller checks schedules once per minute and prevents overlapping runs of the same job. Existing jobs remain manual until automatic scheduling is enabled. Scheduling requires a saved source identity, verified host key, and repository credentials.

Retention fields record the intended policy. Ordinary backup runs do **not** automatically prune or delete archives.

### Hetzner Storage Box

Choose **SFTP Server** when adding a location and provide:

- Your Storage Box hostname and SSH port, normally **23**.
- The account name and repository directory.
- The verified SSH host public key.
- An unencrypted, dedicated SSH private key whose matching public key is installed on the Storage Box.

A path such as `backups/source` is relative to the account's home. In an SFTP URL, a double slash before the path denotes an absolute path, for example `sftp://user@host:23//backups/source`. **Test Connection** checks authentication, host identity, and directory access without creating a repository.

Borg and Rsync use native SSH transport with the saved destination identity and host key; SSHFS is not required for these workflows. Test backup and restore against your own Storage Box before production use.

## Security & recovery

- Protect the bootstrap token, database, and runtime configuration. The Compose stack stores generated configuration and credential-encryption material in `/app/data/.env`.
- Back up encryption material independently and securely. A database backup alone cannot recover encrypted credentials if the encryption material is lost.
- Repeat a restore test after changing repositories, credentials, clients, or recovery configuration.
- Configuration exports contain metadata, **not private credentials**. Imports preserve credentials on matching records and keep new jobs on manual runs. An export is not a replacement for the protected database and runtime encryption material.
- Database settings are preferences; saving them does not migrate or switch the active database. Use **Check Active Database** to query the running connection. GitHub is the implemented SSO provider; unavailable providers and storage engines are marked in the interface.

## Managed Windows clients

Managed Windows clients are **pre-production**. Read the [managed client guide](agent/windows/MANAGED.md) before enrollment.

Download and extract the complete [Windows ZIP from Releases](https://github.com/InSelfControll/FortressBackup/releases), then run **Install FortressBackup.cmd**. The guided setup selects folders and verifies storage and controller access as SYSTEM before starting the agent. The individual `fortress-agent.exe` is a background runner, not an installer. See the [Windows setup guide](agent/windows/INSTALL.md) for prerequisites and diagnostics.

Clients poll the controller over outbound HTTPS. Enrollment displays a client token once, while the controller stores its hash. Backup sources, repository settings, credentials, SSH verification, and the Restic executable remain in protected local Windows configuration. The controller can queue `backup`, `check`, and `snapshots` operations.

Execution leases, an active-job marker, and replay of unacknowledged completion reports provide duplicate-execution safeguards. Current limitations include:

- No full remote provisioning of backup sources, repositories, or credentials.
- No automatic enrollment-token rotation or client updates.
- No file-level managed-client restore interface.
- No completed end-to-end Windows VSS and Hetzner Storage Box restore test.

## Development & verification

The main application lives in `server/`, `client/`, and `components/`. See the [architecture guide](ARCH_README.md), [interface QA notes](docs/interface-qa.md), and [project backlog](TODO.md) for implementation details and test boundaries.

```bash
bun install --frozen-lockfile
bun audit --audit-level=high
bun test
bun run build
bunx tsc --noEmit

# Install Chromium once, then run the browser workflows.
bunx playwright install chromium
bun run test:ui
```

The browser suite uses a disposable controller and SQLite database. Some restore and live-event responses are simulated; external providers and real Storage Box recovery need their own integration environment.
