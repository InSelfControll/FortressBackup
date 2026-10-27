# Managed Windows clients (preview, PR #20)

## Trust model
- Windows clients initiate HTTPS connections to the Fortress controller. No inbound Windows firewall rules needed.
- The controller stores a SHA-256 hash of each randomly generated bearer token; enrollment returns the secret **once**.
- Only controller JWT users with role `admin` can enroll, queue operations or disable an agent.
- Jobs contain **only an allow-listed operation** (`backup`, `check`, `snapshots`).
- Repository, paths, encryption passwords, SSH key, SSH host verification and Restic executable are held in a locally protected Windows agent config, not supplied by the controller.
- One in-flight job per client. A six-hour execution lease requires manual intervention after expiration to prevent automatic duplicate backups.

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
.\\install-task.ps1 -AgentPath 'C:\ProgramData\FortressBackup\fortress-agent.exe' -ConfigPath 'C:\ProgramData\FortressBackup\agent.json' -Managed
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

## Production blockers
- This is an **API-managed preview**, not a complete dashboard-controlled backup system.
- No server-side recurring scheduling or remote selection of backup paths; Task Scheduler handles polling, while the controller queues an operation.
- Client reports only success/failure, not structured Restic progress; failed reporting after a successful backup requires operator reconciliation.
- Config DB read-modify-write updates are not cross-process atomic; multi-replica Fortress deployments require transactional agent/job tables and lease claims.
- No automatic token rotation or transport-level client certificate authentication.
- No end-to-end Windows VSS + Hetzner Storage Box restore test.
- No complete authorization audit of unrelated Fortress endpoints.
- Cloud-to-cloud scripts are not yet controller-managed.
