# FortressBackup Windows Managed Restic Agent

This module is the outbound-only Windows Restic backup client managed by the
FortressBackup controller. It supports Windows VSS, scheduled backup/check jobs,
durable status reporting, and encrypted Restic repositories.

**Canonical setup guide:** [MANAGED.md](MANAGED.md). Do not use old standalone
Task Scheduler instructions.

## Downloads

Download the complete Windows x64 bundle from
[GitHub Releases](https://github.com/InSelfControll/FortressBackup/releases).
It includes the agent executable, Restic, installer, example configuration,
setup guides, license, and checksums. Follow [INSTALL.md](INSTALL.md); building
from source is optional. Enrollment alone does not install the agent.

## Build

```powershell
cd agent/windows
go test ./...
go vet ./...
.\build.ps1 -Version v0.1.0-dev
```

The GitHub Actions Windows workflow builds the executable and tests task
registration. It does not substitute for a complete restore test against your
own backup destination.

`build.ps1` uses the Windows SDK Resource Compiler and the .NET Framework
resource converter to embed the icon and version information in both binaries.
It writes artifact checksums and removes generated resource objects afterward.
The editable icon is `assets/fortress.svg`; `assets/fortress.ico` includes
16, 24, 32, 48, 64, 128, and 256 pixel sizes. The shield/check artwork reuses the
dashboard's Lucide icon and includes its license.

## Critical security constraints

- Use pinned SSH host keys and a dedicated least-privilege Hetzner account.
- The agent and Restic executables must be installed from verified artifacts.
- Install with `install-task.ps1` which validates digests and restricts NTFS ACLs.
- Guided setup downloads the assigned repository credentials securely from the controller and stores them with protected ACLs; source folders are selected locally.
- A backup is only production-ready after testing a real VSS backup and restore.
