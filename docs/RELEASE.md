## Downloads

- **Windows installer:** **FortressBackup-Setup-<version>.exe** installs the app,
  bundled Restic, Start menu shortcut, and Windows uninstall entry. Configure
  after installation or later from the Start menu; no ZIP extraction is required.
- **Advanced Windows ZIP:** agent, app launcher, scripts, configuration example,
  guides, license, and checksums remain available for manual deployments.
- **Controller archive:** complete controller source with the production frontend
  already built. Install Bun, run `bun install --production --frozen-lockfile`, set
  a private `FORTRESS_BOOTSTRAP_TOKEN`, and run `bun start`.
- Individual Windows executables, installer, configuration example, and guides
  are also attached. `SHA256SUMS` covers every downloadable release asset.

## Current changes

- Windows app reconnect now updates an older background runtime through the existing verified setup and rollback path. An app-only upgrade no longer leaves the older snapshot reporting agent behind.
- **Snapshots** automatically loads saved versions; **Backup now** creates a new saved version. Labels use “Backup” consistently.


- Enable disabled enrollments or remove them and their controller history. Repository backups are retained.
- Cancel queued/running jobs; running cancellation remains pending until the worker stops.
- Restore old-device snapshots to a replacement Windows device, including Windows destinations in the main dashboard restore dialog.
- The Windows app is now a native application host with no PowerShell console launch. Saved connections validate automatically when reopened; the background agent continues when the window closes.


- Show actual running operation types and engines on the dashboard, including repository checks, backup browsing, and restores.
- Browse saved Windows backups and restore all files or selected files/folders from Managed Clients or **Backups / Restore** in the installed app. Both use the saved connection and the tracked outbound queue.
- Recover Windows files to a fresh protected folder under `C:\ProgramData\FortressBackup\restores\<job-id>`, preserving original files. Repeated app launches focus its existing window.
- Open the upgraded app to reconnect and update its existing background runtime automatically. Save and connect remains available for changing folders or repairing configuration.
- A backup saves files; a Restic snapshot is the saved version it creates. Listing snapshots does not create another backup.
- Retry transient Defender updater RPC failures without relaxing the required successful update, scan, and installer verification.

## Earlier fixes included

- Add the Fortress icon to the Windows app, installer, uninstaller, Start menu,
  taskbar, and configuration window, with executable version information.
- Scan release files with Microsoft Defender and publish signature/scan details
  in `Windows-trust-report.json`. **This prerelease is unsigned**; no verified
  signing identity is configured. SmartScreen may still warn about a new or
  unrecognized download. A clean antivirus scan does not guarantee reputation.
- Install the app first, then open **Fortress Backup** to configure enrollment,
  the saved repository, and local folders. Reopening loads existing settings.
  Upgrade preserves configuration; uninstall removes the task/runtime while
  retaining saved settings and backup repositories.
- Windows setup now reuses the saved Restic SFTP repository selected in Managed
  Clients. Its address, encryption password, SSH identity, and pinned host key are
  downloaded securely using the enrollment credentials. Choose folders locally;
  no repository password or manual SYSTEM SSH setup is required in guided setup.
- Editing an existing backup job now opens with saved values on the first render.
  Standalone launcher download names match their published checksum entries.
- Setup checks storage and enrollment as SYSTEM without claiming queued backups,
  then starts polling immediately. Errors stay visible; diagnostic logs are stored
  in `C:\ProgramData\FortressBackup`. Failed verification restores the previous install.
- Double-clicking the background executable now displays installation instructions.
  Windows PowerShell 5.1 JSON configurations with a UTF-8 BOM are supported.
- SSH private-key files now retain the final newline OpenSSH requires, including
  keys pasted into the web interface without one.
- Storage port edits preserve credentials and accurately report saved keys.
- Rocky Linux deployment uses the correct package manager. Distribution-managed
  Restic builds without self-update are supported.
- Windows enrollment now explains the required local installation and folder
  configuration. Dashboard activity shows client check-ins and queued operations.

Windows managed clients remain **pre-production**. Enrollment does not install the
agent or select folders. Choose its repository in Managed Clients and run the
installed app with enrollment credentials and a trusted HTTPS controller. A complete Windows VSS
backup and restore against your own storage is still required before relying on it.
