#!/usr/bin/env bash
set -euo pipefail
umask 077

root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
source_dir="$root/source files"
repository="$root/repository"
replica="$root/replica"
restore_dir="$root/restore"
password_file="$root/repo-password"
printf '%s' "$(openssl rand -hex 32)" > "$password_file"
mkdir -p "$source_dir" "$restore_dir"
printf 'FortressBackup recovery verification\n' > "$source_dir/important.txt"
for i in $(seq 1 100); do
  printf 'Small file %04d\n' "$i" > "$source_dir/item-$i.txt"
done

restic --repo "$repository" --password-file "$password_file" init
restic --repo "$repository" --password-file "$password_file" backup -- "$source_dir"
restic --repo "$repository" --password-file "$password_file" check
restic --repo "$repository" --password-file "$password_file" restore latest --target "$restore_dir"
restored=$(find "$restore_dir" -type f -name important.txt -print -quit)
test -n "$restored"
cmp "$source_dir/important.txt" "$restored"
test "$(find "$restore_dir" -type f | wc -l)" -eq 101

# Initialize independent replica with compatible chunker parameters.
restic --repo "$replica" --password-file "$password_file" init \
  --from-repo "$repository" --from-password-file "$password_file" --copy-chunker-params

# Exercise Fortress's actual replication script, including exported env options.
export RESTIC_FROM_REPOSITORY="$repository"
export RESTIC_FROM_PASSWORD_FILE="$password_file"
export RESTIC_TO_REPOSITORY="$replica"
export RESTIC_TO_PASSWORD_FILE="$password_file"
export FORTRESS_REPLICATION_LOCK="$root/replication.lock"
sh scripts/restic-replicate.sh

snapshots=$(restic --repo "$replica" --password-file "$password_file" snapshots --json)
test "$(printf '%s' "$snapshots" | jq length)" -eq 1
# Repeated copy must not create duplicate snapshots.
sh scripts/restic-replicate.sh
again=$(restic --repo "$replica" --password-file "$password_file" snapshots --json)
test "$(printf '%s' "$again" | jq length)" -eq 1

echo "Restic backup, integrity, restore, replication, and idempotence: PASS"
