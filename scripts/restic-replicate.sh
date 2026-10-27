#!/bin/sh
# Controller-side replication for independent restic repositories.
# Requires RESTIC_FROM_REPOSITORY, RESTIC_FROM_PASSWORD_FILE,
# RESTIC_TO_REPOSITORY and RESTIC_TO_PASSWORD_FILE.
set -eu
: "${RESTIC_FROM_REPOSITORY:?missing source repository}"
: "${RESTIC_FROM_PASSWORD_FILE:?missing source password file}"
: "${RESTIC_TO_REPOSITORY:?missing destination repository}"
: "${RESTIC_TO_PASSWORD_FILE:?missing destination password file}"
[ "$RESTIC_FROM_REPOSITORY" != "$RESTIC_TO_REPOSITORY" ] || { echo "source and destination must differ" >&2; exit 2; }
[ -f "$RESTIC_FROM_PASSWORD_FILE" ] && [ -f "$RESTIC_TO_PASSWORD_FILE" ] || { echo "password file missing" >&2; exit 2; }
command -v flock >/dev/null 2>&1 || { echo "flock required" >&2; exit 2; }
lockfile="${FORTRESS_REPLICATION_LOCK:-/tmp/fortress-replication.lock}"
exec 9>"$lockfile"
flock -n 9 || { echo "replication already active" >&2; exit 75; }
# This will fail if the destination repo does not exist. Provision it once
# using restic init --from-repo (copy chunker parameters).
restic -r "$RESTIC_FROM_REPOSITORY" --password-file "$RESTIC_FROM_PASSWORD_FILE" snapshots >/dev/null
restic -r "$RESTIC_TO_REPOSITORY" --password-file "$RESTIC_TO_PASSWORD_FILE" snapshots >/dev/null
restic -r "$RESTIC_FROM_REPOSITORY" --password-file "$RESTIC_FROM_PASSWORD_FILE" copy \
  --repo2 "$RESTIC_TO_REPOSITORY" --password-file2 "$RESTIC_TO_PASSWORD_FILE"
restic -r "$RESTIC_TO_REPOSITORY" --password-file "$RESTIC_TO_PASSWORD_FILE" check
