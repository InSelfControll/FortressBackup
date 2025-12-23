# 🚀 Fortress: Self-hosted backup orchestrator with AI-powered config generation

Hello r/selfhosted community!

I've been working on **Fortress** - a centralized dashboard for managing backups across multiple servers. If you're tired of juggling CLI commands for Borg, Restic, or Rsync, this might interest you.

## 🏰 What is Fortress?

Fortress is a web-based orchestration platform built with React 19 and Node.js that helps you manage your backup tools without replacing them. Think of it as a control center for all your backup operations.

## ✨ Key Features

- **🚀 One-Click SSH Deployment**: Provide SSH access and Fortress automatically detects your OS (Ubuntu, Arch, Fedora, etc.) and installs backup tools
- **🤖 AI Config Generator**: Use natural language to describe your backup needs (e.g., "Backup my /var/www folder every night at 2 AM and keep 7 days of history") and let AI generate the configuration via Gemini/OpenAI *(experimental)*
- **🔒 Zero-Trust Security**: SSH keys encrypted at rest using AES-256-GCM
- **⚙️ Multi-Engine Support**: Native support for Borg, Restic, Rsync, and Rclone *(Rsync/Rclone still in testing)*
- **☁️ Storage Options**:
  - NFS Shares (fully tested ✅)
  - S3-compatible storage
  - Google Drive via Rclone *(experimental)*
- **📊 Live Monitoring**: Real-time "Vitality Index" and log streaming from remote servers

## 🛠️ Tech Stack

- **Frontend**: Vite + React 19 + Tailwind CSS
- **Backend**: Node.js 22 + Express 5
- **Database**: PostgreSQL
- **Encryption**: Web Crypto API + bcryptjs

## 💡 Why Self-Host?

In a world of monthly SaaS subscriptions, I wanted to build something you can audit, run on your own hardware, and truly own. This is for the community.

## 🗺️ What's Next

Currently refactoring the frontend for better modularity and working on comprehensive integration tests for Rclone/Rsync. Check the repository for the full roadmap!

**🔗 GitHub**: https://github.com/InSelfControll/FortressBackup

I'd love your feedback, bug reports, or contributions. Let me know what you think!

---

*Built with ❤️ for the self-hosted community*