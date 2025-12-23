/**
 * SSH Deployment Install Tools Logic
 */

import { SSHExecutor } from './types.js';

export const detectOS = async (executor: SSHExecutor): Promise<{ distro: string; packageManager: string }> => {
    executor.log('info', 'Detecting operating system...');

    // Try to detect Debian/Ubuntu
    try {
        const { stdout } = await executor.executeCommand('cat /etc/os-release 2>/dev/null || echo ""');

        if (stdout.includes('ID=ubuntu') || stdout.includes('ID=debian') || stdout.includes('ID=raspbian')) {
            const nameMatch = stdout.match(/PRETTY_NAME="([^"]+)"/);
            const distro = nameMatch ? nameMatch[1] : 'Debian-based Linux';
            executor.log('success', `Detected: ${distro}`);
            return { distro, packageManager: 'apt' };
        }

        if (stdout.includes('ID=fedora') || stdout.includes('ID=rhel') || stdout.includes('ID=centos')) {
            const nameMatch = stdout.match(/PRETTY_NAME="([^"]+)"/);
            const distro = nameMatch ? nameMatch[1] : 'RHEL-based Linux';
            executor.log('success', `Detected: ${distro}`);
            return { distro, packageManager: 'dnf' };
        }

        if (stdout.includes('ID=arch')) {
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
    executor.log('info', 'Installing Restic...');

    // Try to get latest restic version from GitHub
    const archRes = await executor.executeCommand('uname -m');
    const arch = archRes.stdout.trim();
    let resticArch = 'amd64';
    if (arch === 'aarch64' || arch === 'arm64') {
        resticArch = 'arm64';
    } else if (arch.includes('arm')) {
        resticArch = 'arm';
    }

    // Download latest restic binary
    const downloadCmd = `
        cd /tmp && 
        curl -sL https://github.com/restic/restic/releases/download/v0.16.2/restic_0.16.2_linux_${resticArch}.bz2 -o restic.bz2 &&
        bunzip2 -f restic.bz2 &&
        sudo mv restic /usr/local/bin/restic &&
        sudo chmod +x /usr/local/bin/restic
    `.replace(/\n/g, ' ');

    executor.log('info', `Downloading restic for ${resticArch} architecture...`);

    // Ensure prerequisites
    await executor.executeCommand('which bunzip2 || sudo apt-get install -y bzip2');
    await executor.executeCommand('which curl || sudo apt-get install -y curl');

    const { code } = await executor.executeCommand(downloadCmd);

    if (code === 0) {
        const { stdout } = await executor.executeCommand('restic version 2>/dev/null || echo "not found"');
        if (stdout.includes('restic')) {
            executor.log('success', `Restic installed: ${stdout.trim()}`);
            return true;
        }
    }

    executor.log('error', 'Restic installation failed');
    return false;
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
