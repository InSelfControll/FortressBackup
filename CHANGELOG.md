# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0-rc.10] - 2026-11-01

- Re-enable disabled Windows enrollments or permanently remove them and their controller history while preserving repository backups.
- Cancel queued and running Windows/SSH operations, retaining active ownership until stopping is acknowledged.
- Recover old-device snapshots on replacement Windows devices using the same assigned repository; include Windows destinations in the main restore dialog.
- Replace the external PowerShell GUI launcher with a native Windows application host, modernize its interface, and automatically reconnect saved enrollments when reopening.
- Keep the connection available after saving configuration; closing the window leaves the background agent running.

## [0.1.0-rc.9] - 2026-11-01

- Retry transient Microsoft Defender RPC errors during release signature updates. Signature updating, scanning, and installer verification remain mandatory before publishing downloads.
- Include the Windows recovery, single-window app, and actual-operation dashboard changes from rc.8, whose release packaging was blocked by Defender updater RPC failures.

## [0.1.0-rc.8] - 2026-11-01

- Show the actual running backup, repository check, backup listing, file browsing, or restore operation on the dashboard; track SSH restores without replacing backup statistics.
- Add full and selected-file restores for managed Windows clients in both the dashboard and the installed app. Reuse the saved connection and fixed outbound job queue, with bounded results and per-client snapshot ownership.
- Restore Windows files into a new protected folder per job, preserving original files; escape literal filenames containing pattern characters.
- Reopen and focus the existing Windows application window on repeated launches. Add backup/snapshot explanations and in-window recovery controls.
- Preserve existing clients, jobs, schedules, credentials, and repositories during the schema upgrade. Older Windows runtimes must be upgraded with Save and connect before recovery is available.

## [0.1.0-rc.7] - 2026-11-01

- Apply the existing Fortress shield/check branding to Windows executable resources, installer/uninstaller, shortcuts, and the configuration window.
- Add executable product/version metadata using native Windows build tools.
- Scan release artifacts with Microsoft Defender and publish exact signature/scan status. Stable releases require timestamped signatures; unsigned prereleases remain explicitly identified.
- Document the code-signing identity still needed for verified publisher signing and the limits of antivirus scans and SmartScreen reputation.

## [0.1.0-rc.6] - 2026-10-31

- Add a single Windows installer with bundled app/agent/Restic, Program Files installation, Start menu and optional desktop shortcuts, and an Installed apps uninstall entry.
- Separate installation from configuration. Open the installed app afterward or later to connect the laptop and choose folders; reopening loads the saved connection and folders.
- Preserve settings during upgrades and folder edits. Uninstall stops/removes the agent task/runtime while retaining saved configuration and backup repositories.

## [0.1.0-rc.5] - 2026-10-31

- Replace Windows setup console prompts with a native graphical window for enrollment, saved repository discovery, and folder selection.
- Keep setup responsive during HTTPS provisioning and SYSTEM verification; display progress and failures in the window while preserving protected credentials and upgrade rollback.

## [0.1.0-rc.4] - 2026-10-31

- Reuse controller-configured Restic SFTP repositories during Windows setup. Repository URLs, encryption passwords, SSH identities, and pinned host keys are retrieved automatically over authenticated HTTPS.
- Assign a saved repository during enrollment or to an existing client in Managed Clients; a sole configured repository is selected automatically for new enrollments.
- Install protected storage credentials for SYSTEM without changing its global SSH configuration. Setup asks for enrollment credentials and local folders.
- Restrict credential provisioning to each administrator-assigned repository, block plaintext HTTP, and prevent caching or public inventory disclosure.

## [0.1.0-rc.3] - 2026-10-31

- Initialize an edited backup job with its saved values on the first render, removing the delayed empty form state.
- Match standalone Windows launcher filenames to GitHub's normalized release asset names so checksum manifests verify.

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
