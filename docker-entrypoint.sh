#!/bin/sh
set -e

# If running as root, fix permissions and switch to bunjs user
if [ "$(id -u)" = "0" ]; then
    # Ensure data and logs directories exist with correct ownership
    mkdir -p /app/data /app/logs
    chown -R bunjs:bunjs /app/data /app/logs

    # Switch to bunjs user and re-exec
    exec su-exec bunjs "$0" "$@"
fi

# Running as bunjs user - verify data directory is writable
if ! touch /app/data/.write-test 2>/dev/null; then
    echo "[Fortress] Error: /app/data is not writable"
    exit 1
fi
rm -f /app/data/.write-test

# Execute the main command
exec "$@"
