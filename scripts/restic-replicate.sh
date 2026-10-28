#!/bin/sh
# Controller-side replication for independent restic repositories.
# Requires RESTIC_FROM_REPOSITORY, RESTIC_FROM_PASSWORD_FILE,
# RESTIC_TO_REPOSITORY and RESTIC_TO_PASSWORD_FILE.
set -eu
: "${RESTIC_FROM_REPOSITORY:?missing source repository}"
: "${RESTIC_FROM_PASSWORD_FILE:?missing source password file}"
: "${RESTIC_TO_REPOSITORY:?missing destination repository}"
: "${RESTIC_TO_PASSWORD_FILE:?missing destination password file}"
[ "$from_repo" != "$to_repo" ] || { echo "source and destination must differ" >&2; exit 2; }
[ -f "$from_password" ] && [ -f "$to_password" ] || { echo "password file missing" >&2; exit 2; }
# Restic treats RESTIC_FROM_* as first-class source options. Do not combine
# those exported variables with --from-* flags, which can reject the command.
from_repo=$RESTIC_FROM_REPOSITORY
from_password=$RESTIC_FROM_PASSWORD_FILE
to_repo=$RESTIC_TO_REPOSITORY
to_password=$RESTIC_TO_PASSWORD_FILE
unset RESTIC_FROM_REPOSITORY RESTIC_FROM_PASSWORD_FILE
command -v flock >/dev/null 2>&1 || { echo "flock required" >&2; exit 2; }
lockfile="${FORTRESS_REPLICATION_LOCK:-/tmp/fortress-replication.lock}"
exec 9>"$lockfile"
flock -n 9 || { echo "replication already active" >&2; exit 75; }
# This will fail if the destination repo does not exist. Provision it once
# using restic init --from-repo (copy chunker parameters).
restic -r "$from_repo" --password-file "$from_password" snapshots >/dev/null
restic -r "$to_repo" --password-file "$to_password" snapshots >/dev/null
restic -r "$to_repo" --password-file "$to_password" copy \
  --from-repo "$from_repo" --from-password-file "$from_password"
restic -r "$to_repo" --password-file "$to_password" check
