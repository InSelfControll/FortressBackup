# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0-rc.2] - 2026-10-31

- Add a visible Windows setup launcher with enrollment prompts, folder selection, protected credentials, and immediate task startup.
- Verify repository and controller access as SYSTEM before enabling polling, without claiming queued jobs; roll back failed upgrades and retain diagnostics.
- Accept Windows PowerShell UTF-8 JSON with a BOM and write installed JSON without one.
- Show setup instructions when the background executable is opened without arguments.
- Audit all six older remote branches against their merged PR trees; no branch work is missing from main.

## [0.1.0-rc.1] - 2026-10-31

- Preserve and correctly report storage credentials when editing a connection port.
- Normalize temporary SSH key files for Restic, Borg, and Rsync, including pasted keys missing a final newline.
- Detect Rocky Linux through its declared distribution family and support distribution-managed Restic without self-update.
- Show Windows client setup, check-ins, and queued operations on the dashboard with automatic refresh.
- Publish tested controller archives and Windows x64 bundles, executables, installers, configuration examples, guides, licenses, and checksums through version-tag releases.

## [Unreleased] - 2024-12-25

### Added
- **MacOS Support**: Added platform detection for Darwin to use `umount` instead of `fusermount` for SSHFS support.
- **Landing Page**: New static landing page located in `/landing` with premium Glassmorphism design.
- **Container Support (Alpha)**: Scaffolding for Docker container discovery via `server/services/container/registry.ts`.

### Changed
- **Frontend Architecture**: Refactored massive `App.tsx`, `Settings.tsx`, `Systems.tsx`, `Jobs.tsx` into modular components under `components/`.
- **API Routing**: Fixed Express routing issues by mounting all service routers (`/api/systems`, `/api/jobs`, etc.).
- **Data Fetching**: Migrated entire frontend to **TanStack Query** for efficient caching and state management.
- **Backend Stability**: Fixed Express 5 wildcard route errors.

### Fixed
- Resolved circular dependency warnings in build.
- Fixed `unmount` failures for non-Linux systems.
- Handled missing environment variables for DB connections.

### Notes
- **Testing**: MacOS support currently requires manual verification on actual hardware.
- **Containers**: Container backup logic is currently a scaffold and not fully integrated into the scheduler.

### Refactor
- **Service Cleanup**: Removed legacy `services/` directory and consolidated backend logic into `server/services/`.
- **Frontend API**: Introduced `client/` directory for centralized API definition and TanStack Query hooks.
- **AI Generator**: Fixed module resolution issues in `server/services/ai/generator.ts` and corrected import paths.
- **Type Definitions**: improved root `types.ts` usage across server and client.
