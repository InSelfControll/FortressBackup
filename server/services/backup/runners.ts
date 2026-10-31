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

    try {
        return await executeBackup(executor, jobConfig, sshConfig);
    } finally {
        if (!isPullMode) executor.disconnect();
    }
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

    try {
        return await restore(executor, restoreConfig);
    } finally {
        executor.disconnect();
    }
};

/**
 * List snapshots for a job
 */
export const listJobSnapshots = async (
    sshConfig: SSHConfig,
    config: BackupJobConfig,
    signal?: AbortSignal
): Promise<Snapshot[]> => {
    const executor = new BackupExecutor(false);
    const connected = await executor.connect(sshConfig);

    if (!connected) {
        throw new Error('Failed to connect to SSH server');
    }

    try {
        return await listSnapshots(executor, config, signal);
    } finally {
        executor.disconnect();
    }
};

/**
 * List files in a snapshot
 */
export const listJobFiles = async (
    sshConfig: SSHConfig,
    config: BackupJobConfig,
    snapshotId: string,
    signal?: AbortSignal
): Promise<any[]> => {
    const executor = new BackupExecutor(false);
    const connected = await executor.connect(sshConfig);
    if (!connected) throw new Error('Failed to connect to SSH server');

    try {
        return await listFiles(executor, config, snapshotId, signal);
    } finally {
        executor.disconnect();
    }
};
