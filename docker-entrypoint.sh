#!/bin/sh
set -eu
# Runtime is non-root (UID 1001). Never recursively chown mounted backup data.
[ "$(id -u)" != "0" ] || { echo "[Fortress] Root execution prohibited" >&2; exit 1; }
[ -d /app/data ] && [ -w /app/data ] || { echo "[Fortress] Data volume must be writable by UID 1001" >&2; exit 1; }
umask 077
exec "$@"
