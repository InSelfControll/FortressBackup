/**
 * Restic Backup Command Builder
 */

import { BackupJobConfig } from './types.js';

export const buildResticCommand = (config: BackupJobConfig): string => {
    let env = '';
    let repoPath = config.destinationPath;

    // Handle different destination types for restic
    switch (config.destinationType) {
        case 's3':
            env += `export AWS_ACCESS_KEY_ID = "${config.destinationAccessKey}" && `;
            env += `export AWS_SECRET_ACCESS_KEY = "${config.destinationSecretKey}" && `;
            if (config.destinationEndpoint) {
                repoPath = `s3:${config.destinationEndpoint}/${config.destinationPath}`;
            } else {
                repoPath = `s3:s3.${config.destinationRegion || 'us-east-1'}.amazonaws.com/${config.destinationPath}`;
            }
            break;
        case 'b2':
            env += `export B2_ACCOUNT_ID="${config.destinationAccessKey}" && `;
            env += `export B2_ACCOUNT_KEY="${config.destinationSecretKey}" && `;
            repoPath = `b2:${config.destinationPath}`;
            break;
        case 'sftp':
            repoPath = `sftp:${config.destinationPath}`;
            break;
        case 'nfs':
        case 'nfs': // Fallthrough to default handling for local paths
            // For NFS, we assume the path is a local mount (or local path)
            // No special prefix needed for restic if it's a local filesystem path
            repoPath = config.destinationPath;
            break;
    }

    if (config.repoPassword) {
        env += `export RESTIC_PASSWORD="${config.repoPassword}" && `;
    }

    let cmd = env;

    // Initialize repo if needed
    cmd += `restic init -r ${repoPath} || true && `;

    // Create backup
    // Add --one-file-system to prevent recursion into mount points
    cmd += `restic backup -r ${repoPath} ${config.sourcePaths.join(' ')} --verbose --one-file-system --exclude-caches --exclude='/mnt' --exclude='/media' --exclude='/run/media' --exclude='/run' --exclude='/proc' --exclude='/sys' --exclude='/dev'`;

    // Apply retention policy
    if (config.retention) {
        cmd += ` && restic forget -r ${repoPath} --prune`;
        cmd += ` --keep-hourly ${config.retention.keepHourly}`;
        cmd += ` --keep-daily ${config.retention.keepDaily}`;
        cmd += ` --keep-weekly ${config.retention.keepWeekly}`;
        cmd += ` --keep-monthly ${config.retention.keepMonthly}`;
        cmd += ` --keep-yearly ${config.retention.keepYearly}`;
    }

    return cmd;
};

export const buildResticSnapshotListCommand = (config: BackupJobConfig): string => {
    let env = '';
    let repoPath = config.destinationPath;

    // Handle different destination types
    switch (config.destinationType) {
        case 's3':
            env += `export AWS_ACCESS_KEY_ID="${config.destinationAccessKey}" && `;
            env += `export AWS_SECRET_ACCESS_KEY="${config.destinationSecretKey}" && `;
            if (config.destinationEndpoint) {
                repoPath = `s3:${config.destinationEndpoint}/${config.destinationPath}`;
            } else {
                repoPath = `s3:s3.${config.destinationRegion || 'us-east-1'}.amazonaws.com/${config.destinationPath}`;
            }
            break;
        case 'b2':
            env += `export B2_ACCOUNT_ID="${config.destinationAccessKey}" && `;
            env += `export B2_ACCOUNT_KEY="${config.destinationSecretKey}" && `;
            repoPath = `b2:${config.destinationPath}`;
            break;
        case 'sftp':
            repoPath = `sftp:${config.destinationPath}`;
            break;
        case 'nfs':
            repoPath = config.destinationPath;
            break;
    }

    if (config.repoPassword) {
        env += `export RESTIC_PASSWORD="${config.repoPassword}" && `;
    }

    return `${env} restic snapshots -r ${repoPath} --json`;
};

export const buildResticFileListCommand = (config: BackupJobConfig, snapshotId: string): string => {
    let env = '';
    let repoPath = config.destinationPath;

    // Reuse destination logic (simplified for brevity - in prod reuse helper)
    switch (config.destinationType) {
        case 's3':
            env += `export AWS_ACCESS_KEY_ID="${config.destinationAccessKey}" && `;
            env += `export AWS_SECRET_ACCESS_KEY="${config.destinationSecretKey}" && `;
            if (config.destinationEndpoint) repoPath = `s3:${config.destinationEndpoint}/${config.destinationPath}`;
            else repoPath = `s3:s3.${config.destinationRegion || 'us-east-1'}.amazonaws.com/${config.destinationPath}`;
            break;
        case 'b2':
            env += `export B2_ACCOUNT_ID="${config.destinationAccessKey}" && `;
            env += `export B2_ACCOUNT_KEY="${config.destinationSecretKey}" && `;
            repoPath = `b2:${config.destinationPath}`;
            break;
        case 'sftp': repoPath = `sftp:${config.destinationPath}`; break;
        case 'nfs': repoPath = config.destinationPath; break;
    }

    if (config.repoPassword) env += `export RESTIC_PASSWORD="${config.repoPassword}" && `;

    // restic ls --json <snapshotID>
    return `${env} restic ls --json -r ${repoPath} ${snapshotId}`;
};

export const buildResticRestoreCommand = (config: BackupJobConfig, snapshotId: string, restorePath: string, paths?: string[]): string => {
    let env = '';
    let repoPath = config.destinationPath;

    // Reuse destination logic
    switch (config.destinationType) {
        case 's3':
            env += `export AWS_ACCESS_KEY_ID="${config.destinationAccessKey}" && `;
            env += `export AWS_SECRET_ACCESS_KEY="${config.destinationSecretKey}" && `;
            if (config.destinationEndpoint) repoPath = `s3:${config.destinationEndpoint}/${config.destinationPath}`;
            else repoPath = `s3:s3.${config.destinationRegion || 'us-east-1'}.amazonaws.com/${config.destinationPath}`;
            break;
        case 'b2':
            env += `export B2_ACCOUNT_ID="${config.destinationAccessKey}" && `;
            env += `export B2_ACCOUNT_KEY="${config.destinationSecretKey}" && `;
            repoPath = `b2:${config.destinationPath}`;
            break;
        case 'sftp': repoPath = `sftp:${config.destinationPath}`; break;
        case 'nfs': repoPath = config.destinationPath; break;
    }

    if (config.repoPassword) {
        env += `export RESTIC_PASSWORD="${config.repoPassword}" && `;
    }

    // restic restore <snapshotID> --target <targetDir>
    let cmd = `${env} mkdir -p ${restorePath} && restic restore ${snapshotId} -r ${repoPath} --target ${restorePath}`;

    if (paths && paths.length > 0) {
        cmd += ` ${paths.map(p => `--include '${p}'`).join(' ')}`;
    }

    return cmd;
};
