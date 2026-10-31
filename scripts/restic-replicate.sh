#!/bin/sh
# Controller-side replication for independent restic repositories.
# Requires RESTIC_FROM_REPOSITORY, RESTIC_FROM_PASSWORD_FILE,
# RESTIC_TO_REPOSITORY and RESTIC_TO_PASSWORD_FILE.
set -eu
umask 077
: "${RESTIC_FROM_REPOSITORY:?missing source repository}"
: "${RESTIC_FROM_PASSWORD_FILE:?missing source password file}"
: "${RESTIC_TO_REPOSITORY:?missing destination repository}"
: "${RESTIC_TO_PASSWORD_FILE:?missing destination password file}"
# Restic treats RESTIC_FROM_* as first-class source options. Do not combine
# those exported variables with --from-* flags, which can reject the command.
from_repo=$RESTIC_FROM_REPOSITORY
from_password=$RESTIC_FROM_PASSWORD_FILE
to_repo=$RESTIC_TO_REPOSITORY
to_password=$RESTIC_TO_PASSWORD_FILE
unset RESTIC_FROM_REPOSITORY RESTIC_FROM_PASSWORD_FILE
[ "$from_repo" != "$to_repo" ] || { echo "source and destination must differ" >&2; exit 2; }
[ -f "$from_password" ] && [ -f "$to_password" ] || { echo "password file missing" >&2; exit 2; }
command -v flock >/dev/null 2>&1 || { echo "flock required" >&2; exit 2; }
command -v stat >/dev/null 2>&1 || { echo "stat required" >&2; exit 2; }
lockfile="${FORTRESS_REPLICATION_LOCK:-${XDG_STATE_HOME:-${HOME:?missing HOME}/.local/state}/fortress/replication.lock}"
lockdir=${lockfile%/*}
[ "$lockdir" != "$lockfile" ] || lockdir=.
[ -n "$lockdir" ] || lockdir=/
if [ ! -d "$lockdir" ]; then
  mkdir -p -m 700 "$lockdir" || { echo "unable to create lock directory" >&2; exit 2; }
fi
if [ -L "$lockdir" ] || [ "$(stat -c '%u' "$lockdir")" != "$(id -u)" ] || [ "$(stat -c '%a' "$lockdir")" != 700 ]; then
  echo "lock directory must be private and operator-owned" >&2
  exit 2
fi
[ ! -L "$lockfile" ] || { echo "lockfile must not be a symbolic link" >&2; exit 2; }
if [ -e "$lockfile" ] && [ ! -f "$lockfile" ]; then
  echo "lockfile must be a regular file" >&2
  exit 2
fi
exec 9>>"$lockfile" || { echo "unable to open lockfile" >&2; exit 2; }
flock -n 9 || { echo "replication already active" >&2; exit 75; }
# This will fail if the destination repo does not exist. Provision it once
# using restic init --from-repo (copy chunker parameters).
restic -r "$from_repo" --password-file "$from_password" snapshots >/dev/null
restic -r "$to_repo" --password-file "$to_password" snapshots >/dev/null
restic -r "$to_repo" --password-file "$to_password" copy \
  --from-repo "$from_repo" --from-password-file "$from_password"
restic -r "$to_repo" --password-file "$to_password" check
