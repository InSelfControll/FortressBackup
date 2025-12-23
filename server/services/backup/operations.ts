/**
 * Backup Operations - Execute backup, mount/unmount SSHFS, list snapshots/files, restore
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { BackupExecutor } from './core.js';
import { BackupJobConfig, SSHConfig, BackupResult, Snapshot, RestoreJobConfig } from './types.js';
import { buildBorgCommand, buildBorgSnapshotListCommand, buildBorgRestoreCommand, buildBorgFileListCommand } from './borg.js';
import { buildResticCommand, buildResticSnapshotListCommand, buildResticRestoreCommand, buildResticFileListCommand } from './restic.js';
import { buildRsyncCommand } from './rsync.js';

/**
 * Mount an SFTP destination via SSHFS on the remote node
 */
export async function mountSshfs(executor: BackupExecutor, config: BackupJobConfig): Promise<string> {
    const mountPoint = `/tmp/fortress_mnt_${config.jobId}`;

    let sshfsTarget: string;
    if (config.destinationPath.includes('@')) {
        sshfsTarget = config.destinationPath;
    } else if (config.destinationEndpoint) {
        sshfsTarget = `${config.destinationEndpoint}:${config.destinationPath}`;
    } else {
        throw new Error('SFTP destination requires either user@host:/path format or a configured endpoint');
    }

    executor.log('info', `Mounting SFTP destination: ${sshfsTarget} -> ${mountPoint}`);

    const mountCmd = `mkdir -p ${mountPoint} && sshfs -o StrictHostKeyChecking=no,reconnect,ServerAliveInterval=15 ${sshfsTarget} ${mountPoint}`;

    const { code, stderr } = await executor.exec(mountCmd);
    if (code !== 0) {
        throw new Error(`Failed to mount SFTP destination: ${stderr}`);
    }

    executor.log('success', `SFTP destination mounted at ${mountPoint}`);
    return mountPoint;
}

/**
 * Unmount SSHFS mount point on the remote node
 */
export async function unmountSshfs(executor: BackupExecutor, mountPoint: string): Promise<void> {
    executor.log('info', `Unmounting SFTP destination: ${mountPoint}`);
    const unmountCmd = `fusermount -uz ${mountPoint} 2>/dev/null || umount -l ${mountPoint} 2>/dev/null || true; rmdir ${mountPoint} 2>/dev/null || true`;
    await executor.exec(unmountCmd);
    executor.log('info', `SFTP destination unmounted`);
}

/**
 * Execute a backup job
 */
export async function executeBackup(
    executor: BackupExecutor,
    config: BackupJobConfig,
    sshConfig?: SSHConfig
): Promise<BackupResult> {
    const startTime = new Date();
    const logs = executor.getLogs();

    executor.log('info', `Starting ${config.tool} backup: ${config.jobName}`);
    executor.log('info', `Source: ${config.sourcePaths.join(', ')}`);
    executor.log('info', `Destination: ${config.destinationPath}`);

    let tempKeyFile = '';
    let sftpMountPoint = '';

    try {
        let effectiveDestPath = config.destinationPath;
        if (config.destinationType === 'sftp') {
            sftpMountPoint = await mountSshfs(executor, config);
            effectiveDestPath = sftpMountPoint;
            executor.log('info', `Using mounted path: ${effectiveDestPath}`);
        }

        const effectiveConfig = { ...config, destinationPath: effectiveDestPath };
        let command: string;

        if (executor.isLocalMode() && config.tool === 'rsync' && sshConfig) {
            if (sshConfig.privateKey && sshConfig.privateKey.startsWith('-----')) {
                const keyPath = path.join(os.tmpdir(), `fortress_key_${config.jobId}`);
                fs.writeFileSync(keyPath, sshConfig.privateKey, { mode: 0o600 });
                tempKeyFile = keyPath;
            } else if (sshConfig.privateKey) {
                tempKeyFile = sshConfig.privateKey;
            }

            command = buildRsyncCommand(effectiveConfig, sshConfig, executor.isLocalMode()).replace('%%KEYFILE%%', tempKeyFile);
            if (!tempKeyFile) {
                throw new Error('Local Rsync execution requires an SSH Private Key.');
            }
        } else {
            switch (config.tool) {
                case 'borg':
                    command = buildBorgCommand(effectiveConfig);
                    break;
                case 'restic':
                    command = buildResticCommand(effectiveConfig);
                    break;
                case 'rsync':
                    command = buildRsyncCommand(effectiveConfig);
                    break;
                default:
                    executor.log('error', `Unsupported backup tool: ${config.tool}`);
                    return {
                        success: false,
                        startTime,
                        endTime: new Date(),
                        errors: [`Unsupported tool: ${config.tool}`],
                        logs
                    };
            }
        }

        const { stdout, stderr, code } = await executor.exec(command);

        if (tempKeyFile && tempKeyFile.startsWith(os.tmpdir())) {
            try { fs.unlinkSync(tempKeyFile); } catch { }
        }

        const endTime = new Date();

        if (code === 0) {
            executor.log('success', `Backup completed successfully!`);

            let bytesProcessed = 0;
            let filesProcessed = 0;

            const sizeMatch = stdout.match(/(\d+\.?\d*)\s*(GB|MB|KB|bytes)/i);
            if (sizeMatch) {
                const value = parseFloat(sizeMatch[1]);
                const unit = sizeMatch[2].toUpperCase();
                bytesProcessed = unit === 'GB' ? value * 1e9 :
                    unit === 'MB' ? value * 1e6 :
                        unit === 'KB' ? value * 1e3 : value;
            }

            const filesMatch = stdout.match(/(\d+)\s*files?/i);
            if (filesMatch) {
                filesProcessed = parseInt(filesMatch[1]);
            }

            executor.log('stats', `Processed ${filesProcessed} files, ${(bytesProcessed / 1e6).toFixed(2)} MB`);

            if (sftpMountPoint) {
                await unmountSshfs(executor, sftpMountPoint);
            }

            return { success: true, startTime, endTime, bytesProcessed, filesProcessed, errors: [], logs };
        } else {
            executor.log('error', `Backup failed with exit code ${code}`);
            executor.addError(`Exit code: ${code}`);
            if (stderr) executor.addError(stderr);

            if (sftpMountPoint) await unmountSshfs(executor, sftpMountPoint);

            return { success: false, startTime, endTime, errors: executor.getErrors(), logs };
        }
    } catch (err: any) {
        if (tempKeyFile && tempKeyFile.startsWith(os.tmpdir())) {
            try { fs.unlinkSync(tempKeyFile); } catch { }
        }
        if (sftpMountPoint) {
            try { await unmountSshfs(executor, sftpMountPoint); } catch { }
        }

        executor.log('error', `Backup execution error: ${err.message}`);
        executor.addError(err.message);

        return { success: false, startTime, endTime: new Date(), errors: executor.getErrors(), logs };
    }
}

/**
 * List snapshots for a job
 */
export async function listSnapshots(executor: BackupExecutor, config: BackupJobConfig): Promise<Snapshot[]> {
    const command = config.tool === 'borg'
        ? buildBorgSnapshotListCommand(config)
        : config.tool === 'restic'
            ? buildResticSnapshotListCommand(config)
            : null;

    if (!command) {
        executor.log('error', 'Snapshot listing not supported for this tool');
        throw new Error(`Snapshot listing not supported for ${config.tool}`);
    }

    const { stdout, code } = await executor.exec(command);
    if (code !== 0) throw new Error('Failed to list snapshots');

    const snapshots: Snapshot[] = [];
    const data = JSON.parse(stdout);

    if (config.tool === 'borg') {
        data.archives.forEach((archive: any) => {
            snapshots.push({
                id: archive.name,
                shortId: archive.id.substring(0, 8),
                time: archive.time,
                paths: config.sourcePaths,
                hostname: archive.hostname || 'unknown'
            });
        });
    } else if (config.tool === 'restic') {
        data.forEach((snap: any) => {
            snapshots.push({
                id: snap.id,
                shortId: snap.short_id,
                time: snap.time,
                paths: snap.paths,
                hostname: snap.hostname
            });
        });
    }

    return snapshots.reverse();
}

/**
 * List files in a snapshot
 */
export async function listFiles(executor: BackupExecutor, config: BackupJobConfig, snapshotId: string): Promise<any[]> {
    const command = config.tool === 'borg'
        ? buildBorgFileListCommand(config, snapshotId)
        : config.tool === 'restic'
            ? buildResticFileListCommand(config, snapshotId)
            : null;

    if (!command) throw new Error(`File listing not supported for ${config.tool}`);

    const { stdout, code } = await executor.exec(command);
    if (code !== 0) throw new Error('Failed to list files');

    const files: any[] = [];

    if (config.tool === 'borg') {
        stdout.split('\n').filter(Boolean).forEach(line => {
            try {
                const entry = JSON.parse(line);
                files.push({
                    path: entry.path,
                    size: entry.size || 0,
                    mode: entry.mode,
                    mtime: entry.mtime,
                    type: entry.type === '-' ? 'file' : entry.type === 'd' ? 'directory' : 'other'
                });
            } catch (e) { }
        });
    } else if (config.tool === 'restic') {
        stdout.split('\n').filter(Boolean).forEach(line => {
            try {
                const entry = JSON.parse(line);
                if (entry.struct_type === 'node') {
                    files.push({
                        path: entry.path || entry.name,
                        size: entry.size || 0,
                        mode: entry.mode && entry.mode.toString(8),
                        mtime: entry.mtime,
                        type: entry.type === 'dir' ? 'directory' : 'file'
                    });
                }
            } catch (e) { }
        });
    }

    return files;
}

/**
 * Restore from a snapshot
 */
export async function restore(executor: BackupExecutor, config: RestoreJobConfig): Promise<BackupResult> {
    const startTime = new Date();
    const logs = executor.getLogs();

    executor.log('info', `Starting Restore for snapshot: ${config.snapshotId}`);
    executor.log('info', `Target Path: ${config.restorePath}`);

    const command = config.tool === 'borg'
        ? buildBorgRestoreCommand(config, config.snapshotId, config.restorePath)
        : config.tool === 'restic'
            ? buildResticRestoreCommand(config, config.snapshotId, config.restorePath)
            : null;

    if (!command) {
        return { success: false, startTime, endTime: new Date(), errors: ['Restore not supported for tool'], logs };
    }

    const { code, stderr } = await executor.exec(command);
    const endTime = new Date();

    if (code === 0) {
        executor.log('success', 'Restore completed successfully');
        return { success: true, startTime, endTime, errors: [], logs };
    } else {
        executor.log('error', `Restore failed: ${stderr}`);
        return { success: false, startTime, endTime, errors: [stderr], logs };
    }
}
