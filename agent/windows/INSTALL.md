# Install Fortress Backup on Windows x64

Download **FortressBackup-Setup-<version>.exe** from
[GitHub Releases](https://github.com/InSelfControll/FortressBackup/releases),
then double-click it and approve the administrator prompt. The single installer
includes Fortress Backup, its agent, and Restic. No ZIP extraction, Go, or
separate Restic download is needed.

The installer adds the app to `C:\Program Files\FortressBackup`, the Start menu,
and Windows **Installed apps**. You can open configuration after Finish or skip
it and configure later. Installing the app does not enroll a client or start an
unconfigured backup task.

## Configure the installed app

Open **Fortress Backup** from the Start menu. Enter the trusted HTTPS controller
address and the enrollment ID/token from **Managed Clients**, then click
**Connect**. Select the repository in the dashboard; a sole saved Restic SFTP
repository is assigned automatically during enrollment. Existing enrollments
remain valid.

The repository URL, encryption password, SSH identity, and pinned host key are
retrieved automatically. Use **Add folder...** and **Remove** to select folders,
then click **Save and connect**. The app enables Windows OpenSSH if needed,
installs protected credentials, and checks storage and controller access as
SYSTEM before starting the background agent. Errors and progress stay visible.
Closing the app before saving leaves your current backup configuration unchanged.

Reopen Fortress Backup to edit folders later. It loads the existing connection,
masked enrollment token, and selected folders. Saving folder changes preserves
existing exclusions, host name, timeout, and VSS settings.

The repository must already be initialized and reachable from the laptop. Use
a controller HTTPS address with a certificate Windows trusts. An HTTP server IP
cannot be used for credential provisioning. When TLS terminates at a reverse
proxy, set the controller's `TRUST_PROXY` to that proxy's exact addresses.

Verification reads snapshots and sends a heartbeat without claiming a queued
backup. Failed verification rolls back the previous protected files and task.
Diagnostics are in `C:\ProgramData\FortressBackup\setup-check.log` and `agent.log`.
After saving, follow check-ins and operations in **Managed Clients**. A successful
installation/configuration does not mean a backup has completed; test a backup
and a complete restore before relying on it. Windows clients remain pre-production.

## Upgrade and uninstall

Run the newer installer to upgrade the app. Saved configuration and the existing
background task are retained; reopen the app and save to update its protected
runtime files. Wait for active backups to finish before applying configuration.

Uninstall through Windows **Installed apps**. This removes the app, shortcuts,
and its background task/runtime. Saved settings and credentials in
`C:\ProgramData\FortressBackup` are retained for reinstall. Backup repositories
are never deleted.

The ZIP and individual files remain available for advanced/manual deployment.
`fortress-agent.exe` is the background runner. For ordinary installation, use the
single **FortressBackup-Setup-<version>.exe** installer.

## Advanced manual configuration

Use this only for an independently managed configuration. The guided setup above
automatically provisions saved credentials; no repository password entry is needed.

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
