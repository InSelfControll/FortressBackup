# Changelog

All notable changes to this project will be documented in this file.

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
