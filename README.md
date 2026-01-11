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
- **Runtime**: Node.js 22
- **Framework**: Express 5
- **Execution**: `tsx` (TypeScript Execution)
- **SSH**: `ssh2` for remote orchestration
- **Auth**: JWT + bcryptjs

### Database
- **Primary**: PostgreSQL (via `pg`)
- **Local/Cache**: Better-SQLite3

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v22.x or higher
- **PostgreSQL**: A running instance (or use the provided Docker setup)
- **(Optional) Gemini API Key**: For natural language backup configuration

### Installation

1. **Install Prerequisites**:
   - Ensure you have **Node.js 22** installed. You can use **npm** or **pnpm** or **bun** .
   - Install **sqlite3** on your host system (required for local database operations).

2. **Clone and Install**:
   ```bash
   git clone https://github.com/InSelfControll/FortressBackup.git
   cd FortressBackup
   npm install # or pnpm install # bun install
   ```

3. **Initialize Setup**:
   - Run the system and follow the on-screen setup process to configure your master password and initial settings.

2. **Environment Setup**:
   Copy `.env.example` to `.env` and configure your database and API keys. - Not needed automatically generated after completing the setup proccess from the browser.

3. **Running the System**:
   ```bash
   # Development (with hot-reload)
   npm run dev or bun run dev
   ```

### Production Deployment

For a stable production environment, follow these steps:

1. **Build the Frontend**:
   ```bash
   npm run build or bun run build
   ```

2. **Start the Integrated Server**:
   ```bash
   npm start or bun start
   ```
   The server will now serve both the API and the pre-built frontend assets.

---

## 🔒 Security Architecture

Fortress implements several layers of security:
1. **At-Rest Encryption**: Sensitive credentials and SSH keys are encrypted in the database.
2. **Path Isolation**: Backup processes are executed with minimum required privileges on remote systems.
3. **Session Management**: Secure JWT-based authentication with automatic expiration handling.

---

<p align="center">
  Built with ❤️ by the Fortress Engineering Team
</p>
