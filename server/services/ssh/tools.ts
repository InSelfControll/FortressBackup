/**
 * SSH Deployment Install Tools Logic
 */

import { SSHExecutor } from './types.js';

export const detectOS = async (executor: SSHExecutor): Promise<{ distro: string; packageManager: string }> => {
    executor.log('info', 'Detecting operating system...');

    // Match both the distribution and its declared compatible families.
    try {
        const { stdout } = await executor.executeCommand('cat /etc/os-release 2>/dev/null || echo ""');
        const ids = (stdout.match(/^(?:ID|ID_LIKE)=.*$/gm) || []).flatMap(line =>
            line.slice(line.indexOf('=') + 1).replace(/["']/g, '').trim().split(/\s+/));

        if (ids.some(id => ['ubuntu', 'debian', 'raspbian'].includes(id))) {
            const nameMatch = stdout.match(/PRETTY_NAME="([^"]+)"/);
            const distro = nameMatch ? nameMatch[1] : 'Debian-based Linux';
            executor.log('success', `Detected: ${distro}`);
            return { distro, packageManager: 'apt' };
        }

        if (ids.some(id => ['fedora', 'rhel', 'centos'].includes(id))) {
            const nameMatch = stdout.match(/PRETTY_NAME="([^"]+)"/);
            const distro = nameMatch ? nameMatch[1] : 'RHEL-based Linux';
            executor.log('success', `Detected: ${distro}`);
            return { distro, packageManager: 'dnf' };
        }

        if (ids.includes('arch')) {
            executor.log('success', 'Detected: Arch Linux');
            return { distro: 'Arch Linux', packageManager: 'pacman' };
        }
    } catch {
        // Continue with fallback detection
    }

    // Fallback - try uname
    try {
        const { stdout: uname } = await executor.executeCommand('uname -a');
        executor.log('info', `System: ${uname.trim()}`);
    } catch {
        // Ignore
    }

    executor.log('info', 'Using apt as default package manager');
    return { distro: 'Unknown Linux', packageManager: 'apt' };
};

export const installBorg = async (executor: SSHExecutor, packageManager: string): Promise<boolean> => {
    executor.log('info', 'Installing BorgBackup...');

    let installCmd: string;
    switch (packageManager) {
        case 'apt':
            installCmd = 'sudo DEBIAN_FRONTEND=noninteractive apt-get install -y borgbackup';
            break;
        case 'dnf':
            installCmd = 'sudo dnf install -y borgbackup';
            break;
        case 'pacman':
            installCmd = 'sudo pacman -S --noconfirm borg';
            break;
        default:
            installCmd = 'sudo apt-get install -y borgbackup';
    }

    // First update package index
    if (packageManager === 'apt') {
        executor.log('info', 'Updating package index...');
        await executor.executeCommand('sudo apt-get update -qq');
    }

    const { code } = await executor.executeCommand(installCmd);

    if (code === 0) {
        // Verify installation
        const { stdout } = await executor.executeCommand('borg --version 2>/dev/null || echo "not found"');
        if (stdout.includes('borg')) {
            executor.log('success', `BorgBackup installed: ${stdout.trim()}`);
            return true;
        }
    }

    executor.log('error', 'BorgBackup installation failed');
    return false;
};

export const installRestic = async (executor: SSHExecutor): Promise<boolean> => {
    executor.log('info', 'Installing or verifying Restic...');

    // Bootstrap from a trusted distribution repository. The upstream self-update
    // operation validates signed release metadata when available in the package.
    const command = [
        'set -eu',
        'if ! command -v restic >/dev/null 2>&1; then',
        '  if command -v apt-get >/dev/null 2>&1; then',
        '    sudo -n apt-get update -qq',
        '    sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y restic',
        '  elif command -v dnf >/dev/null 2>&1; then',
        '    sudo -n dnf install -y restic',
        '  elif command -v pacman >/dev/null 2>&1; then',
        '    sudo -n pacman -S --needed --noconfirm restic',
        '  else',
        '    echo "No supported trusted package source for Restic" >&2; exit 1',
        '  fi',
        'fi',
        'if restic self-update --help >/dev/null 2>&1; then',
        '  tmpdir=$(mktemp -d)',
        '  trap \'rm -rf "$tmpdir"\' EXIT HUP INT TERM',
        '  restic self-update --output "$tmpdir/restic"',
        '  if [ -s "$tmpdir/restic" ]; then',
        '    chmod 755 "$tmpdir/restic"',
        '    "$tmpdir/restic" version',
        '    sudo -n install -m 0755 "$tmpdir/restic" /usr/local/bin/restic',
        '  fi',
        'else',
        '  echo "Using distribution-managed Restic (self-update unavailable)"',
        'fi',
        'restic version',
    ].join('\n');
    // This script contains only constant code, never untrusted job parameters.
    const shellCommand = "sh -c '" + command.replace(/'/g, "'\\''") + "'";
    try {
        const { code, stdout, stderr } = await executor.executeCommand(shellCommand);
        if (code !== 0) {
            executor.log('error', `Restic update failed: ${stderr || stdout}`);
            return false;
        }
        executor.log('success', `Restic verified: ${stdout.trim().split('\n').pop() || 'verified'}`);
        return true;
    } catch (error) {
        executor.log('error', `Restic update failed: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
};

export const installRsync = async (executor: SSHExecutor, packageManager: string): Promise<boolean> => {
    executor.log('info', 'Installing rsync...');

    let installCmd: string;
    switch (packageManager) {
        case 'apt':
            installCmd = 'sudo DEBIAN_FRONTEND=noninteractive apt-get install -y rsync';
            break;
        case 'dnf':
            installCmd = 'sudo dnf install -y rsync';
            break;
        case 'pacman':
            installCmd = 'sudo pacman -S --noconfirm rsync';
            break;
        default:
            installCmd = 'sudo apt-get install -y rsync';
    }

    const { code } = await executor.executeCommand(installCmd);

    if (code === 0) {
        const { stdout } = await executor.executeCommand('rsync --version 2>/dev/null | head -1 || echo "not found"');
        if (stdout.includes('rsync')) {
            executor.log('success', `rsync installed: ${stdout.trim()}`);
            return true;
        }
    }

    executor.log('error', 'rsync installation failed');
    return false;
};
