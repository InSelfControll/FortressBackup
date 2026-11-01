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

The app and installer now use the Fortress shield/check icon. Current prereleases
are **unsigned** because no verified signing identity is configured. A clean
Defender scan does not guarantee that SmartScreen will recognize a new download.
See [Windows publisher trust](https://github.com/InSelfControll/FortressBackup/blob/main/docs/WINDOWS-TRUST.md) and the release's
`Windows-trust-report.json` for signature and scan results.

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

Reopen Fortress Backup to edit folders later. It automatically validates the saved connection, updates an older background runtime with the installed release using the existing protected setup/rollback checks, and loads the
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

## Snapshots and backup

Click **Backup now** to save a new snapshot. Click **Snapshots** to automatically load saved backups, or **Refresh snapshots** to refresh the list. A snapshot is a saved backup version.

## Browse and restore saved backups

A backup creates a Restic **snapshot**, a saved version of the selected files.
Listing snapshots does not create another backup. Windows VSS snapshots are
separate temporary source copies used to read files consistently during backup.

In the installed app, choose **Backups / Restore**, then **Load saved backups**.
This opens inside the existing window and uses the saved controller credentials.
Select **Include backups from old / other devices** to recover a previous device from this same repository, even if its enrollment was removed. The replacement device must have this repository assigned and configured. Choose a saved backup, select a folder and click **Open folder** to browse, and check individual files
or folders. Use **Restore selected** or **Restore entire backup**. A checked folder
includes its contents; up to 100 selections are allowed per restore. Selections
remain checked when you navigate between folders. **Clear selection** resets them.

Restored files go into a new folder under
`C:\ProgramData\FortressBackup\restores\<job-id>`; original files are preserved.
Use **Open restored folder** after completion, then copy recovered files to their
final location. This protected folder requires administrator access. A failed
restore can leave partial files there; inspect agent.log before using them.

The dashboard offers the same controls under **Managed Clients → Browse backups
and restore**. The laptop must be online and configured. Requests remain queued
until the agent checks in; progress and the actual operation appear on the dashboard.
After upgrading, open the app. Reconnecting automatically verifies and updates an older background runtime. If a backup is active, wait for it to finish and refresh the connection. Clicking the app again
restores and focuses its existing native application window. No PowerShell console is launched to display it.

## Cancel and manage enrollments

Use **Cancel operation** in recovery, **Cancel job** in Managed Clients, or the
cancel control on an active SSH job. Queued jobs cancel immediately. Running jobs
show cancellation requested until the agent stops them; an offline device must
check in before it can acknowledge the request. Upgrade old agents for running
job cancellation. Partial restore files can remain in the new recovery folder.

Disabled enrollments have **Enable** and **Remove enrollment** actions in Managed
Clients. Removal revokes the controller token and deletes controller history; it
never deletes Restic snapshots. Disable and stop active jobs before removal.

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
