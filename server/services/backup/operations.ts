/**
 * Backup Operations - Execute backup, mount/unmount SSHFS, list snapshots/files, restore
 */

import fs from 'fs';
import { parseBackupStats } from './stats.js';
import os from 'os';
import path from 'path';
import { BackupExecutor } from './core.js';
import { BackupJobConfig, SSHConfig, BackupResult, Snapshot, RestoreJobConfig } from './types.js';
import { buildBorgCommand, buildBorgSnapshotListCommand, buildBorgRestoreCommand, buildBorgFileListCommand } from './borg.js';
import { buildResticCommand, buildResticSnapshotListCommand, buildResticRestoreCommand, buildResticFileListCommand } from './restic.js';
import { buildRsyncCommand } from './rsync.js';
import { quote } from './commandSafety.js';

/**
 * Mount an SFTP destination via SSHFS on the remote node
 */
export async function mountSshfs(executor: BackupExecutor, config: BackupJobConfig): Promise<string> {
    if (!/^[a-f0-9-]{36}$/i.test(config.jobId)) throw new Error('Invalid job identifier for SSHFS mount');
    const mountPoint = `/tmp/fortress_mnt_${config.jobId}`;

    let sshfsTarget: string;
    let sshfsPort: number | undefined;
    if (config.destinationPath.startsWith('sftp://')) {
        const target = new URL(config.destinationPath);
        if (target.password || target.search || target.hash)
            throw new Error('SFTP URL must not contain a password, query, or fragment');
        sshfsPort = Number(target.port || 22);
        if (!Number.isInteger(sshfsPort) || sshfsPort < 1 || sshfsPort > 65535)
            throw new Error('Invalid SFTP port');
        sshfsTarget = `${target.username}@${target.hostname}:${target.pathname}`;
    } else if (config.destinationPath.includes('@')) {
        sshfsTarget = config.destinationPath;
    } else if (config.destinationEndpoint) {
        sshfsTarget = `${config.destinationEndpoint}:${config.destinationPath}`;
    } else {
        throw new Error('SFTP destination requires either user@host:/path format or a configured endpoint');
    }

    if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9.:-]+:[A-Za-z0-9._/:-]+$/.test(sshfsTarget))
        throw new Error('SFTP target must be a user@host:/path remote target');
    executor.log('info', `Mounting verified SFTP destination at ${mountPoint}`);

    const portOption = sshfsPort ? ` -p ${sshfsPort}` : '';
    const mountCmd = `mkdir -p -- ${quote(mountPoint)} && sshfs${portOption} -o StrictHostKeyChecking=yes,reconnect,ServerAliveInterval=15 ${quote(sshfsTarget)} ${quote(mountPoint)}`;

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

    if (!/^\/tmp\/fortress_mnt_[a-f0-9-]{36}$/i.test(mountPoint))
        throw new Error('Refusing to unmount unexpected path');
    const target=quote(mountPoint);
    const {code,stderr}=await executor.exec(`(fusermount -u ${target} || umount ${target}) && rmdir -- ${target}`);
    if(code!==0)throw new Error(`Unable to unmount SFTP destination: ${stderr.slice(0,2048)}`);
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
    let tempKeyDir = '';
    let sftpMountPoint = '';

    try {
        let effectiveDestPath = config.destinationPath;
        // SSH destinations are handled natively by each builder with the saved identity and host pin.


        const effectiveConfig = { ...config, destinationPath: effectiveDestPath };
        let command: string;

        if (executor.isLocalMode() && config.tool === 'rsync' && sshConfig) {
            if (sshConfig.privateKey && sshConfig.privateKey.startsWith('-----')) {
                tempKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fortress-ssh-'));
                fs.chmodSync(tempKeyDir, 0o700);
                const keyPath=path.join(tempKeyDir,'key');
                fs.writeFileSync(keyPath, sshConfig.privateKey, { mode:0o600,flag:'wx' });
                tempKeyFile=keyPath;
            } else if (sshConfig.privateKey) {
                if(!path.isAbsolute(sshConfig.privateKey) || !/^[A-Za-z0-9_./-]+$/.test(sshConfig.privateKey))
                    throw new Error('Local rsync SSH private key path must be a restricted absolute path');
                const info=fs.lstatSync(sshConfig.privateKey);
                if(!info.isFile() || (info.mode & 0o077)!==0)
                    throw new Error('Rsync SSH key must be an owner-only regular file');
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

        if(tempKeyDir) {
            try { fs.rmSync(tempKeyDir,{recursive:true,force:true}); } catch { }
            tempKeyDir='';
        }

        const endTime = new Date();

        // Guard: Handle Failure
        if (code !== 0) {
            executor.log('error', `Backup failed with exit code ${code}`);
            executor.addError(`Exit code: ${code}`);
            if (stderr) executor.addError(stderr);

            if (sftpMountPoint) await unmountSshfs(executor, sftpMountPoint);

            return { success: false, startTime, endTime, errors: executor.getErrors(), logs };
        }

        // Happy Path: Success
        executor.log('success', `Backup completed successfully!`);

        const {bytesProcessed,filesProcessed} = parseBackupStats(stdout+'\n'+stderr);

        if (sftpMountPoint) {
            await unmountSshfs(executor, sftpMountPoint);
        }

        return { success: true, startTime, endTime, bytesProcessed, filesProcessed, errors: [], logs };

    } catch (err: any) {
        if(tempKeyDir) {
            try { fs.rmSync(tempKeyDir,{recursive:true,force:true}); } catch { }
            tempKeyDir='';
        }
        if (sftpMountPoint) {
            try { await unmountSshfs(executor, sftpMountPoint); } catch { }
        }

        executor.log('error', `Backup execution error: ${err.message}`);
        executor.addError(err.message);

        return { success: false, startTime: startTime || new Date(), endTime: new Date(), errors: executor.getErrors(), logs };
    }
}

/**
 * List snapshots for a job
 */
export async function listSnapshots(executor: BackupExecutor, config: BackupJobConfig, signal?: AbortSignal): Promise<Snapshot[]> {
    const command = config.tool === 'borg'
        ? buildBorgSnapshotListCommand(config)
        : config.tool === 'restic'
            ? buildResticSnapshotListCommand(config)
            : null;

    if (!command) {
        executor.log('error', 'Snapshot listing not supported for this tool');
        throw new Error(`Snapshot listing not supported for ${config.tool}`);
    }

    const { stdout, code } = await executor.exec(command, signal);
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
export async function listFiles(executor: BackupExecutor, config: BackupJobConfig, snapshotId: string, signal?: AbortSignal): Promise<any[]> {
    const command = config.tool === 'borg'
        ? buildBorgFileListCommand(config, snapshotId)
        : config.tool === 'restic'
            ? buildResticFileListCommand(config, snapshotId)
            : null;

    if (!command) throw new Error(`File listing not supported for ${config.tool}`);

    const { stdout, code } = await executor.exec(command, signal);
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

    if (config.paths?.length === 0) throw new Error('Restore path selection cannot be empty');

    const command = config.tool === 'borg'
        ? buildBorgRestoreCommand(config, config.snapshotId, config.restorePath, config.paths)
        : config.tool === 'restic'
            ? buildResticRestoreCommand(config, config.snapshotId, config.restorePath, config.paths)
            : null;

    if (!command) {
        return { success: false, startTime, endTime: new Date(), errors: ['Restore not supported for tool'], logs };
    }

    const { code, stderr } = await executor.exec(command);
    const endTime = new Date();

    if (code !== 0) {
        executor.log('error', `Restore failed: ${stderr}`);
        return { success: false, startTime, endTime, errors: [stderr], logs };
    }

    // Happy Path
    executor.log('success', 'Restore completed successfully');
    return { success: true, startTime, endTime, errors: [], logs };
}
