# Install Fortress Backup on Windows x64

Download `fortressbackup-windows-amd64-<version>.zip` from
[GitHub Releases](https://github.com/InSelfControll/FortressBackup/releases).
It includes the Fortress agent, Restic, the installer, an example configuration,
the managed-client guide, licenses, and SHA-256 checksums. You do not need Go.

**Enrollment creates credentials; it does not install software.** Windows clients
remain pre-production. Folder selection is configured on the laptop rather than
through the dashboard.

1. Verify the ZIP's SHA-256 against the release's `SHA256SUMS`, then extract it to
   `C:\FortressSetup`. The commands below assume that directory.
2. In Fortress, enroll the laptop and save its one-time ID and token. Write the
   token to `C:\FortressSetup\agent-token.txt` without displaying it in logs.
3. Copy `agent.example.json` to `agent.json`. Replace every `YOUR_` or `PASTE_`
   placeholder and the repository username. Set `sources` to the folders you want
   backed up, and edit `excludes` if needed. The controller URL must use trusted
   HTTPS; an HTTP IP address cannot be used by the Windows agent.
4. Save the repository's existing encryption password in
   `C:\FortressSetup\repository-password.txt`. Initialize a new encrypted Restic
   repository separately if it does not exist. Never initialize over another
   backup engine's repository or guess the password of an existing repository.
5. Enable the Windows OpenSSH client. Configure the dedicated storage SSH identity
   and verified host key for **SYSTEM**, which runs the task. Its profile is normally
   `C:\Windows\System32\config\systemprofile\.ssh`. Protect the private key and
   SSH configuration so only SYSTEM and Administrators can modify them. Finish SSH
   private-key files with a newline. Do not disable host-key verification.
6. Open PowerShell as Administrator and run:

```powershell
Set-Location C:\FortressSetup
$agentHash = ((Select-String -Path .\SHA256SUMS -Pattern '  fortress-agent.exe$').Line -split '\s+')[0]
$resticHash = ((Select-String -Path .\SHA256SUMS -Pattern '  restic.exe$').Line -split '\s+')[0]
.\install-task.ps1 -AgentPath .\fortress-agent.exe -ConfigPath .\agent.json `
  -AgentSha256 $agentHash -ResticSha256 $resticHash -Managed
Start-ScheduledTask -TaskName FortressBackup-Windows
```

The installer copies protected files to `C:\ProgramData\FortressBackup` and
registers a SYSTEM task that polls every minute. A pending operation can start on
the first check-in. The dashboard and **Managed Clients** show check-ins and queued,
running, completed, or failed operations. They do not show file-level progress.

If the client remains **Awaiting setup**, check the scheduled task's result and
run the installed agent from an elevated terminal to inspect configuration errors:

```powershell
& 'C:\ProgramData\FortressBackup\fortress-agent.exe' `
  -config 'C:\ProgramData\FortressBackup\agent.json' -operation managed
```

The manual check can execute a queued backup. Do not run it alongside the scheduled
task. Preserve the token and encryption password, and test a complete restore.
See `MANAGED.md` for recovery safeguards and current limitations.
