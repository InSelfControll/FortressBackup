
# 🛡️ Fortress Backup Manager

**Fortress** is an enterprise-grade, stunning orchestration dashboard designed for modern infrastructure. It provides a unified, secure interface for managing disparate backup backends including **BorgBackup**, **Restic**, **Rsync**, and **Rclone**.

Featuring an **optional** AI-powered job architect, a zero-trust cryptographic vault for identity management, and native SSO integration, Fortress transforms complex CLI-based backup workflows into a streamlined, high-visibility experience.

---

## ✨ Key Features

- **Multi-Engine Orchestration**: Native support for:
  - **BorgBackup**: High-efficiency deduplication and compression.
  - **Restic**: Modern, secure cloud-native backups.
  - **Rsync over SSH**: Reliable 1:1 file mirroring.
  - **Rclone**: The "Swiss army knife" for S3, B2, and 50+ cloud providers.
- **AI Backup Architect (Optional)**: Support for **Google Gemini** or any **OpenAI-compatible** API to translate natural language requirements into optimized cron schedules and retention policies.
- **Zero-Trust Identity Vault**: Local-first AES-256-GCM encryption for SSH private keys and secrets. Your master password never leaves the browser.
- **Enterprise SSO**: Out-of-the-box integration for Google Workspace and GitHub Enterprise authentication.
- **Health Monitoring**: Real-time "Vitality Index" visualization for managed systems and detailed process logs for every snapshot.
- **Visual Analytics**: Interactive Recharts-powered dashboard for storage growth tracking and deduplication ratios.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: Version 20.x or higher.
- **AI Config (Optional)**: OpenAI-compatible or Gemini API key.
- **SSH Access**: To the systems you intend to back up.

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-org/fortress-backup-manager.git
   cd fortress-backup-manager
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Launch the Dashboard**:
   ```bash
   npm run dev
   ```

---

## 🔒 Security Architecture

Fortress is built with a "Security-First" mindset:

- **Client-Side Encryption**: Private keys are encrypted using the Web Crypto API before being stored in `localStorage`.
- **Zero-Knowledge**: The dashboard never sends your master password or decrypted SSH keys to any server.
- **Isolated Workers**: The provided `Fortress.yaml` includes a containerized execution worker to keep backup processes separate from the UI layer.

---

<p align="center">
  Built with ❤️ by the Fortress Engineering Team
</p>
