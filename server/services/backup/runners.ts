/**
 * Job Runners - Top-level wrapper functions for running backup/restore jobs
 */

import { BackupExecutor } from './core.js';
import { executeBackup, listSnapshots, listFiles, restore } from './operations.js';
import { SSHConfig, BackupJobConfig, BackupExecutionLog, BackupResult, Snapshot, RestoreJobConfig } from './types.js';

/**
 * Run a backup job
 */
export const runBackupJob = async (
    sshConfig: SSHConfig,
    jobConfig: BackupJobConfig,
    onLog?: (log: BackupExecutionLog) => void
): Promise<BackupResult> => {
    const isPullMode = jobConfig.tool === 'rsync' && jobConfig.destinationType === 'nfs';
    const executor = new BackupExecutor(isPullMode);

    if (onLog) {
        executor.on('log', onLog);
    }

    const connected = await executor.connect(sshConfig);
    if (!connected) {
        return {
            success: false,
            startTime: new Date(),
            endTime: new Date(),
            errors: ['Failed to connect to SSH server'],
            logs: []
        };
    }

    const result = await executeBackup(executor, jobConfig, sshConfig);

    if (!isPullMode) {
        executor.disconnect();
    }

    return result;
};

/**
 * Run a restore job
 */
export const runRestoreJob = async (
    sshConfig: SSHConfig,
    restoreConfig: RestoreJobConfig,
    onLog?: (log: BackupExecutionLog) => void
): Promise<BackupResult> => {
    const executor = new BackupExecutor(false);

    if (onLog) executor.on('log', onLog);

    const connected = await executor.connect(sshConfig);
    if (!connected) {
        return { success: false, startTime: new Date(), endTime: new Date(), errors: ['SSH Connection Failed'], logs: [] };
    }

    const result = await restore(executor, restoreConfig);
    executor.disconnect();
    return result;
};

/**
 * List snapshots for a job
 */
export const listJobSnapshots = async (
    sshConfig: SSHConfig,
    config: BackupJobConfig
): Promise<Snapshot[]> => {
    const executor = new BackupExecutor(false);
    const connected = await executor.connect(sshConfig);

    if (!connected) {
        throw new Error('Failed to connect to SSH server');
    }

    try {
        const snapshots = await listSnapshots(executor, config);
        executor.disconnect();
        return snapshots;
    } catch (error) {
        executor.disconnect();
        throw error;
    }
};

/**
 * List files in a snapshot
 */
export const listJobFiles = async (
    sshConfig: SSHConfig,
    config: BackupJobConfig,
    snapshotId: string
): Promise<any[]> => {
    const executor = new BackupExecutor(false);
    const connected = await executor.connect(sshConfig);
    if (!connected) throw new Error('Failed to connect to SSH server');

    try {
        const files = await listFiles(executor, config, snapshotId);
        executor.disconnect();
        return files;
    } catch (error) {
        executor.disconnect();
        throw error;
    }
};
