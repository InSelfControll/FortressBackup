#!/bin/sh
# Maintenance is intentionally decoupled from every backup.
set -eu
: "${RESTIC_REPOSITORY:?}"
: "${RESTIC_PASSWORD_FILE:?}"
action="${1:-}"
case "$action" in
 check)
   exec restic check
   ;;
 forget)
   # Apply retention without deleting packs; prune is a separate operation.
   exec restic forget --group-by host,paths \
     --keep-daily "${KEEP_DAILY:-7}" \
     --keep-weekly "${KEEP_WEEKLY:-4}" \
     --keep-monthly "${KEEP_MONTHLY:-12}"
   ;;
 prune)
   exec restic prune
   ;;
 *)
   echo "usage: $0 check|forget|prune" >&2
   exit 2
   ;;
esac
