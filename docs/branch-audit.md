# Branch integration audit — 2026-10-31

Compared all six older remote branches with their merged PRs and `main` at
`189fb2596ecfa2a1a457d0c7d15391492e5a001d`. Each remote head still equals the PR
head, each PR head has exactly the same Git file tree as its squash merge, and
each squash merge is an ancestor of `main`. There are no later branch changes
waiting to be integrated. Re-merging these branches would duplicate already
integrated history.

| Remote branch | PR | Branch head | Squash merge in main | Result |
| --- | --- | --- | --- | --- |
| `fix/fortress-restic-hardening` | #20 | `9d632b2` | `ba19928` | Exact merged tree |
| `work/latest-main` | #21 | `9f22d7a` | `1e16804` | Exact merged tree |
| `fix/security-remediation` | #22 | `b243dc8` | `5d5d6ff` | Exact merged tree |
| `fix/mobile-layouts-location-saving` | #23 | `ac9b599` | `d725145` | Exact merged tree |
| `fix/github-actions-builds` | #24 | `e93767d` | `23c6847` | Exact merged tree |
| `docs/professional-readme` | #25 | `682fd63` | `8945489` | Exact merged tree |

The newer `fix/backup-auth-and-windows-releases` branch also exactly matches its
#26 squash merge, `189fb25`.

Integration is not proof that every feature works in every environment. Validate
the resulting main tree using Bun regressions, TypeScript/build checks, browser
workflows, Windows Go tests/vet, protected-install and rollback checks under
Windows PowerShell 5.1, VSS backup/restore, Restic replication, and pinned SFTP
backup/restore. These checks are included in the controller and Windows CI gates.
The Windows setup fix addresses a real remaining gap: the released executable
was a CLI runner and appeared to do nothing when opened directly. It also fixes
the PowerShell 5.1 BOM incompatibility found while tracing installation.

Remaining deployment boundary: the actual laptop must have local storage
credentials, trusted HTTPS connectivity, and a successful backup and restore.
The Windows integration remains pre-production until that is verified.
