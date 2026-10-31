# Managed Windows clients (PR #20, pre-production)

## Downloads and first installation

Get the Windows x64 bundle from [GitHub Releases](https://github.com/InSelfControll/FortressBackup/releases)
and follow [INSTALL.md](INSTALL.md). The bundle includes both executables, the
installer, a complete configuration example, and checksums. Enrollment only creates
an identity and token; install and configure the agent on the laptop separately.
Choose source folders using the local configuration's `sources` list.

## Trust model
- Windows clients initiate HTTPS connections to the Fortress controller. No inbound Windows firewall rules needed.
- The controller stores a SHA-256 hash of each randomly generated bearer token; enrollment returns the secret **once**.
- Only controller JWT users with role `admin` can enroll, queue operations or disable an agent.
- Jobs contain **only an allow-listed operation** (`backup`, `check`, `snapshots`).
- Repository, paths, encryption passwords, SSH key, SSH host verification and Restic executable are held in a locally protected Windows agent config, not supplied by the controller.
- One in-flight job per client. A five-hour execution lease requires manual intervention after expiration to prevent automatic duplicate backups.

## Controller enrollment
Obtain an administrator JWT through the regular Fortress login.

```bash
curl -sS -X POST "https://fortress.example.net/api/managed-agents/admin/enroll" \
  -H "Authorization: Bearer $FORTRESS_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  --data '{"name":"windows-laptop"}'
```

Store the response `id` and `token` securely. Do not log or commit either value.

Add to the existing `agent.json`:
```json
{
  "controllerUrl": "https://fortress.example.net",
  "agentId": "enrollment-id",
  "agentTokenFile": "C:\\ProgramData\\FortressBackup\\agent-token.txt"
}
```
These three fields must be merged into the agent's backup configuration, which must also include Restic repository, passwordFile, sources and VSS preference. Restrict the token, config, SSH identity and password file ACLs to the scheduled-task identity and Administrators. Use dedicated Hetzner Storage Box credentials.

## Configure polling
Run PowerShell as administrator:

```powershell
.\\install-task.ps1 -AgentPath 'C:\FortressSetup\fortress-agent.exe' -ConfigPath 'C:\FortressSetup\agent.json' -AgentSha256 '<trusted-agent-SHA256>' -ResticSha256 '<trusted-restic-SHA256>' -Managed
```

The task uses SYSTEM for VSS and polls every minute. SYSTEM has its own OpenSSH identity/known_hosts files; provision a **pinned trusted Hetzner host key** and dedicated SSH key for that identity before enabling the task. Protect the controller with a trusted TLS certificate and private network or Cloudflare Access if needed.

## Queue backup from the controller
```bash
curl -sS -X POST "https://fortress.example.net/api/managed-agents/admin/ENROLLMENT_ID/jobs" \
  -H "Authorization: Bearer $FORTRESS_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  --data '{"operation":"backup"}'
```

Inspect status (no token hash is returned):
```bash
curl -sS "https://fortress.example.net/api/managed-agents/admin/ENROLLMENT_ID" \
  -H "Authorization: Bearer $FORTRESS_ADMIN_JWT"
```

Disable a stolen client credential:
```bash
curl -sS -X POST "https://fortress.example.net/api/managed-agents/admin/ENROLLMENT_ID/disable" \
  -H "Authorization: Bearer $FORTRESS_ADMIN_JWT"
```

## Central management
- Open **Managed Clients** in the Fortress admin dashboard to enroll clients, queue backup/check/snapshot operations, select a recurring schedule and revoke client access.
- Client enrollment and job state use dedicated indexed database tables with an atomic job-claim operation and a unique constraint preventing overlapping active jobs.
- The Windows agent stores a pending completion report beside its locally protected enrollment-token file and retries that report on the next polling run. The controller accepts duplicate completion acknowledgments safely.
- Backups are scheduled in the controller; the Windows Task Scheduler runs the agent poller every minute.

## Production blockers
- Backup source folders, repository destinations and credentials remain locally configured and are not centrally editable. This reduces remote attack surface but is not full remote policy provisioning.
- No client auto-update or rotation of existing enrollment tokens.
- No structured Restic progress or user-visible file-level restore from the managed-client screen.
- No automatic token rotation or transport-level client certificate authentication.
- No end-to-end Windows VSS + Hetzner Storage Box restore test.
- A complete security audit of all unrelated Fortress endpoints and a real Windows VSS restore test are still required.
- Cloud-to-cloud scripts are not yet controller-managed.

## Recovery safeguards

The Windows agent writes `fortress-active-job.json` before running a leased job. After an interrupted process it intentionally refuses duplicate execution until the operator verifies the repository and clears that marker. A completed but unacknowledged job is saved to `fortress-pending-report.json` for replay on the next poll. Both files live in the secured enrollment directory.

Restic requires an absolute trusted `resticPath`, and the installed Task Scheduler executable is protected by SYSTEM/Administrators-only NTFS permissions. The controller cannot change the Windows executable path or backup passwords remotely.
