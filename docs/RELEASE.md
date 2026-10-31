## Downloads

- **Windows x64 bundle:** Fortress agent, Restic 0.19.1, guided setup launcher and protected-task installer,
  configuration example, setup guides, Restic license, and checksums. No Go build
  is required on the laptop.
- **Controller archive:** complete controller source with the production frontend
  already built. Install Bun, run `bun install --production --frozen-lockfile`, set
  a private `FORTRESS_BOOTSTRAP_TOKEN`, and run `bun start`.
- Individual Windows executables, installer, configuration example, and guides
  are also attached. `SHA256SUMS` covers every downloadable release asset.

## Fixes

- Extract the complete Windows ZIP and double-click **Install FortressBackup.cmd**.
  Setup asks for enrollment and repository credentials and opens a folder picker.
  Storage authentication for SYSTEM and a trusted HTTPS controller are prerequisites.
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
agent or select folders. Run the included setup launcher on the laptop with
storage credentials and a trusted HTTPS controller. A complete Windows VSS
backup and restore against your own storage is still required before relying on it.
