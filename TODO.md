# 🚀 Project Roadmap & TODO

Help us make Fortress the best self-hosted backup orchestrator! Here is what's currently on our radar:

## 🏗️ Frontend Architecture & Refactoring
- [ ] **Component Modularization**: Refactor all frontend files to be under 250 lines of code.
- [ ] **Folder-based Organization**: Split components into specialized folders:
  - `/components/ui`: Atomic, reusable UI elements.
  - `/components/features`: Complex domain-specific components (e.g., Jobs, Systems).
  - `/components/layout`: Page structure and navigation.
- [ ] **Naming Rules**: Enforce clear directory-based grouping to improve maintainability for contributors.

## 🤖 AI & Tooling
- [ ] **AI Integration Verification**: Thoroughly test Gemini and OpenAI-compatible provider logic for generating backup schedules.
- [ ] **Engine Expansion**:
  - [ ] Verify and stable-test **Rclone** integration.
  - [ ] Verify and stable-test **Rsync** over SSH.
  - [ ] **Cloud Storage Integration**: Test S3-compatible storage and Google Drive connectivity.

## 🎨 Design & Experience
- [ ] **New Landing Page**: Create a high-converting, premium landing page that explains the project's value proposition.
- [ ] **UI Refresh**: Modernize the dashboard with enhanced Glassmorphism and micro-animations.
- [ ] **Dark Mode Optimization**: Ensure accessibility and visual excellence across all themes.

---

Want to contribute? Check out our [ARCH_README.md](./ARCH_README.md) to understand how the system works!
