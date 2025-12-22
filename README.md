# 🛡️ Fortress Backup Manager

**Fortress** is an enterprise-grade, stunning orchestration dashboard designed for modern infrastructure. It provides a unified, secure interface for managing disparate backup backends including **BorgBackup**, **Restic**, **Rsync**, and **Rclone**.

Featuring AI-powered job configuration, a zero-trust cryptographic vault for identity management, and native SSO integration, Fortress transforms complex CLI-based backup workflows into a streamlined, high-visibility experience.

---

## ✨ Key Features

- **Multi-Engine Orchestration**: Native support for:
  - **BorgBackup**: High-efficiency deduplication and compression.
  - **Restic**: Modern, secure cloud-native backups.
  - **Rsync over SSH**: Reliable 1:1 file mirroring.
  - **Rclone**: The "Swiss army knife" for S3, B2, and 50+ cloud providers.
- **AI Backup Architect**: Leverages **Google Gemini 3** to translate natural language requirements into optimized cron schedules and retention policies.
- **Zero-Trust Identity Vault**: Local-first AES-256-GCM encryption for SSH private keys and secrets. Your master password never leaves the browser.
- **Enterprise SSO**: Out-of-the-box integration for Google Workspace and GitHub Enterprise authentication.
- **Health Monitoring**: Real-time "Vitality Index" visualization for managed systems and detailed process logs for every snapshot.
- **Visual Analytics**: Interactive Recharts-powered dashboard for storage growth tracking and deduplication ratios.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: Version 20.x or higher.
- **Gemini API Key**: Required for AI configuration features.
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

3. **Configure Environment**:
   Create a `.env` file in the root directory:
   ```env
   API_KEY=your_google_gemini_api_key_here
   ```

4. **Launch the Dashboard**:
   ```bash
   npm run dev
   ```

---

## 🛠️ Usage Guide

### 1. Initialization Sequence
Upon first launch, you will enter the **Setup Wizard**:
- **Tool Selection**: Select your backup arsenal (Borg, Restic, etc.).
- **SSO Link**: Authenticate via your organization's IDP.
- **Vault Setup**: Choose a strong Master Password. This password generates your PBKDF2-derived encryption key.

### 2. Managing Systems
Navigate to the **Systems** tab to add remote hosts:
- **SSH Identities**: Import your private keys into the vault. Keys are encrypted instantly.
- **Connection Testing**: Use the built-in "Verify" tool to ensure the dashboard can reach the remote host via SSH.

### 3. Creating AI-Powered Jobs
When creating a new backup plan, use the **AI Architect** field:
- **Prompt**: *"Back up my production database every 2 hours, keep hourly snapshots for 3 days and weekly for a month."*
- **Apply**: Fortress will automatically calculate the CRON string and retention integers.

---

## 🔒 Security Architecture

Fortress is built with a "Security-First" mindset:

- **Client-Side Encryption**: Private keys are encrypted using the Web Crypto API before being stored in `localStorage`.
- **Zero-Knowledge**: The backend never sees your master password or decrypted SSH keys.
- **Isolated Workers**: The provided `Fortress.yaml` includes a containerized execution worker to keep backup processes separate from the UI layer.

---

## 📦 Deployment on GitHub

To host Fortress as a private internal tool using GitHub:

1. **GitHub Pages / Actions**: 
   Since Fortress is a React-based SPA, it can be deployed to GitHub Pages. Ensure you use **GitHub Actions Secrets** to inject your `API_KEY` during the build process.

2. **Workflow Configuration**:
   Create `.github/workflows/deploy.yml`:
   ```yaml
   name: Deploy to GH Pages
   on:
     push:
       branches: [main]
   jobs:
     build-and-deploy:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - name: Install & Build
           run: |
             npm install
             npm run build
           env:
             API_KEY: ${{ secrets.GEMINI_API_KEY }}
         - name: Deploy
           uses: JamesIves/github-pages-deploy-action@v4
           with:
             folder: dist
   ```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<p align="center">
  Built with ❤️ by the Fortress Engineering Team
</p>
