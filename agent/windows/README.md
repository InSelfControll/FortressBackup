# FortressBackup Windows Restic Agent (early integration)

Windows-only, non-listening executable that runs Restic with VSS, using an explicit JSON configuration. Runs locally under a restricted Windows account. **This is a standalone agent, not yet paired to the Fortress controller.**

## Requirements

- Windows 10/11 or supported Windows Server with VSS
- A current, separately installed `restic.exe`
- SFTP identity configured in Windows OpenSSH and pinned host key in known_hosts
- Repository initialized once with `restic init -r ...`
- Repository password file and config restricted to the backup account and Administrators

Build on Windows or cross-compile from Linux:

```bash
cd agent/windows
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -o fortress-agent.exe .
```

Example `C:\\ProgramData\\FortressBackup\\agent.json`:

```json
{
  "resticPath": "C:\\Program Files\\Restic\\restic.exe",
  "repository": "sftp:hetzner-backup:restic/laptop",
  "passwordFile": "C:\\ProgramData\\FortressBackup\\repo-password.txt",
  "sources": ["C:\\Users\\Example\\Documents", "C:\\Users\\Example\\Videos"],
  "excludes": ["*.tmp"],
  "host": "windows-laptop",
  "timeoutMinutes": 240,
  "useVSS": true
}
```

```powershell
.\\fortress-agent.exe -config 'C:\ProgramData\FortressBackup\agent.json' -operation backup
.\\fortress-agent.exe -config 'C:\ProgramData\FortressBackup\agent.json' -operation check
```

The process exits nonzero on Restic failure. Windows Task Scheduler can run the same command under a dedicated account. Set **Do not start a new instance** and configure retries, and collect exit codes for monitoring.

Use `restic self-update` under a controlled maintenance schedule. Restic verifies the upstream release signature.

### Known limitations

- No controller enrollment, polling, heartbeat or authenticated job reporting yet.
- No cloud replication or repo maintenance orchestration in this executable.
- VSS needs sufficient account permissions.
- No Windows end-to-end backup-and-restore test yet.
- Do not share a single write-capable Storage Box account between laptop and controller when the controller can be compromised.
