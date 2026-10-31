# Install Fortress Backup on Windows x64

Download `fortressbackup-windows-amd64-<version>.zip` from
[GitHub Releases](https://github.com/InSelfControll/FortressBackup/releases).
It includes the Fortress agent, Restic, the installer, an example configuration,
the managed-client guide, licenses, and SHA-256 checksums. You do not need Go.

**Enrollment creates credentials; it does not install software.** Windows clients
remain pre-production. Folder selection is configured on the laptop rather than
through the dashboard.

## Guided setup

Extract the **complete ZIP**, then double-click **Install FortressBackup.cmd**.
Approve the administrator prompt. Setup keeps its window open, asks for the
enrollment ID and token, trusted HTTPS controller URL, existing Restic repository
and encryption password, and opens a folder picker. Add as many folders as needed.
Tokens and passwords are hidden during entry and stored with protected ACLs.

Before running setup, configure storage authentication for SYSTEM as described
in step 5 below. The repository must already be initialized and reachable from
the laptop. An HTTP server IP cannot be used for enrollment credentials; use a
reachable controller HTTPS name with a certificate Windows trusts.

Setup verifies binary checksums, validates configuration, and checks repository
access and enrollment **as SYSTEM**. Verification only reads snapshots and sends
a heartbeat; it does not claim a queued backup. On failure, the previous files
and task are restored and an error remains visible. Read
`C:\ProgramData\FortressBackup\setup-check.log` for details.

On success, setup starts the task immediately. The dashboard shows the check-in;
any queued backup may then start. The latest polling run is recorded in
`C:\ProgramData\FortressBackup\agent.log`. Setup success does not mean a backup
has finished: check the job result and perform a full restore test.

**fortress-agent.exe is the background runner.** Double-clicking it displays setup
instructions. It does not install anything or select folders. Download the ZIP
instead of the individual executable for installation.

## Manual configuration

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
  -AgentSha256 $agentHash -ResticSha256 $resticHash -Managed -VerifySetup
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
