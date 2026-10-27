# 🛡️ Fortress Backup Manager

**Fortress** is an enterprise-grade orchestration dashboard designed for modern infrastructure management. It provides a unified, secure interface for managing disparate backup engines including **BorgBackup**, **Restic**, **Rsync**, and **Rclone**.

Featuring an automatic **SSH Deployment Service**, an AI-powered job architect, and a zero-trust cryptographic vault, Fortress simplifies complex CLI-based backup workflows into a high-visibility, professional experience.

---

## ✨ Key Features

- **Multi-Engine Orchestration**: Native support for:
  - **BorgBackup**: High-efficiency deduplication and compression.
  - **Restic**: Modern, secure cloud-native backups.
  - **Rsync over SSH**: Reliable 1:1 file mirroring.
  - **Rclone**: Cloud storage synchronization (S3, B2, Google Drive, etc.).
- **🚀 SSH Deployment Service**: Automatically detect remote OS and install required backup tools (Borg, Restic, Rsync) with one click. Rsync & Rclone are not tested yet.
- **AI Backup Architect**: Leverages **Google Gemini** and **OpenAI COMPATIBLE** to translate natural language requirements into optimized cron schedules and retention policies. - Not tested yet
- **Zero-Trust Identity Vault**: Local-first AES-256-GCM encryption for SSH private keys. Keys are only decrypted at the last possible moment for connection.
- **Universal Health Monitoring**: Real-time "Vitality Index" for all managed systems with live log streaming.
- **Visual Analytics**: Interactive Recharts-powered dashboard for storage growth and deduplication tracking.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Icons**: Lucide React

### Backend
- **Runtime**: Bun (native TypeScript execution)
- **Framework**: Express 5
- **SSH**: `ssh2` for remote orchestration
- **Auth**: JWT + bcryptjs

### Database
- **Primary**: PostgreSQL (via `pg`)
- **Local/Embedded**: bun:sqlite (built-in, 3-6x faster than better-sqlite3)

---

## 🚀 Getting Started

### Prerequisites
- **Bun**: v1.0 or higher ([install](https://bun.sh))
- **PostgreSQL**: A running instance (optional - SQLite works out of the box)
- **(Optional) Gemini API Key**: For natural language backup configuration

### Installation

1. **Clone and Install**:
   ```bash
   git clone https://github.com/InSelfControll/FortressBackup.git
   cd FortressBackup
   bun install
   ```

2. **Running the System**:
   ```bash
   # Start both API and Web UI (using concurrently)
   bun run dev

   # Or run separately
   bun run dev:server    # Backend only
   bun run dev:frontend  # Frontend only
   ```

3. **Initialize Setup**:
   - Open your browser to `http://localhost:3001`
   - Follow the on-screen setup wizard to configure your database, admin user, and master password
   - The `.env` file is automatically generated after completing setup

### Docker Deployment

**Protect the first-run bootstrap and encryption keys.** Set a unique `FORTRESS_BOOTSTRAP_TOKEN` (at least 32 random characters) in the container's protected runtime environment before starting. The setup wizard requires it. Do not expose port 9001 to the public network; use a TLS reverse proxy or private access path.

Fortress stores JWT and credential-encryption keys in `/app/data/.env`, which **must** be persisted alongside the database. Back up the protected env file separately. Losing its key prevents decryption of stored credentials.



```bash
# Build the container
docker build -t fortressbackup .

# Run with SQLite (default)
docker run -p 127.0.0.1:9001:9001 -v fortress-data:/app/data fortressbackup

# Run with volume mount (ensure directory is owned by UID 1001)
mkdir -p ./data && sudo chown 1001:1001 ./data && chmod 700 ./data
docker run -p 127.0.0.1:9001:9001 -v ./data:/app/data fortressbackup
```

---

## 🔒 Security Architecture

- Remote SSH systems require manually verified SHA256 host-key fingerprints before connection.
- Never grant writable permissions to other users on the `/app/data` volume.
- Keep the Windows agent, Restic executable, and credential files protected with installer-enforced NTFS ACLs.
- Validate backup and restore against a disposable repository before production use.


Fortress implements several layers of security:
1. **At-Rest Encryption**: Sensitive credentials and SSH keys are encrypted in the database.
2. **Path Isolation**: Backup processes are executed with minimum required privileges on remote systems.
3. **Session Management**: Secure JWT-based authentication with automatic expiration handling.
4. **Non-Root Container**: Production container runs as non-root user (UID 1001) for enhanced security.

---

<p align="center">
  Built with ❤️ by the Fortress Engineering Team
</p>
