#!/usr/bin/env bash
# Isolated SFTP backend integration test, no external storage credentials.
set -euo pipefail
umask 077
dir=$(mktemp -d)
trap 'if [ -f "$dir/sshd.pid" ]; then sudo kill "$(cat "$dir/sshd.pid")" 2>/dev/null || true; fi; rm -rf "$dir"' EXIT

sudo useradd -m -U -s /bin/bash fortress-ci
sudo install -d -m 700 -o fortress-ci -g fortress-ci /home/fortress-ci/.ssh
ssh-keygen -q -t ed25519 -N '' -f "$dir/client-key"
sudo install -m 600 -o fortress-ci -g fortress-ci "$dir/client-key.pub" /home/fortress-ci/.ssh/authorized_keys
sudo install -d -m 755 /run/sshd
sudo /usr/sbin/sshd -p 22482 -o PidFile=$dir/sshd.pid -o ListenAddress=127.0.0.1 -o PasswordAuthentication=no -o PubkeyAuthentication=yes
ssh-keyscan -T 5 -p 22482 -t ed25519 127.0.0.1 2>/dev/null > "$dir/known_hosts"
test -s "$dir/known_hosts"
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
cat >> "$HOME/.ssh/config" <<EOF
Host fortress-restic-ci
  HostName 127.0.0.1
  User fortress-ci
  Port 22482
  IdentityFile $dir/client-key
  IdentitiesOnly yes
  UserKnownHostsFile $dir/known_hosts
  StrictHostKeyChecking yes
  BatchMode yes
EOF
chmod 600 "$HOME/.ssh/config"

repo='sftp:fortress-restic-ci:restic-ci-repository'
pass="$dir/password-file"
printf '%s' "$(openssl rand -hex 32)" > "$pass"
mkdir -p "$dir/source" "$dir/restore"
printf 'Verified encrypted SFTP backup\n' > "$dir/source/record.txt"

echo 'SFTP: initialize repository'
timeout --signal=TERM --kill-after=5 90 restic -r "$repo" --password-file "$pass" init
echo 'SFTP: backup source'
timeout --signal=TERM --kill-after=5 90 restic -r "$repo" --password-file "$pass" backup -- "$dir/source"
echo 'SFTP: verify repository integrity'
timeout --signal=TERM --kill-after=5 90 restic -r "$repo" --password-file "$pass" check
echo 'SFTP: restore snapshot'
timeout --signal=TERM --kill-after=5 90 restic -r "$repo" --password-file "$pass" restore latest --target "$dir/restore"
restored=$(find "$dir/restore" -type f -name record.txt -print -quit)
test -n "$restored"
cmp "$dir/source/record.txt" "$restored"
echo "Restic SFTP over pinned OpenSSH, integrity and restore: PASS"
