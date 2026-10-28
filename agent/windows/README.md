# FortressBackup Windows Managed Restic Agent

This module is the outbound-only Windows Restic backup client managed by the
FortressBackup controller. It supports Windows VSS, scheduled backup/check jobs,
durable status reporting, and encrypted Restic repositories.

**Canonical setup guide:** [MANAGED.md](MANAGED.md). Do not use old standalone
Task Scheduler instructions.

## Build

```powershell
cd agent/windows
go test ./...
go vet ./...
go build -trimpath -o fortress-agent.exe .
```

The GitHub Actions Windows workflow builds the executable and tests task
registration. It does not substitute for a complete restore test against your
own backup destination.

## Critical security constraints

- Use pinned SSH host keys and a dedicated least-privilege Hetzner account.
- The agent and Restic executables must be installed from verified artifacts.
- Install with `install-task.ps1` which validates digests and restricts NTFS ACLs.
- Backup credentials and source selection remain stored locally on Windows.
- A backup is only production-ready after testing a real VSS backup and restore.
