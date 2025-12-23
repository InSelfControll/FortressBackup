/**
 * Borg Backup Command Builder
 */

import { BackupJobConfig } from './types.js';

export const buildBorgCommand = (config: BackupJobConfig): string => {
    const repoPath = config.destinationPath;
    const archiveName = `${config.jobName}-{now:%Y-%m-%d_%H:%M:%S}`;

    if (['s3', 'b2', 'gcs', 'azure', 'gdrive', 'onedrive'].includes(config.destinationType)) {
        throw new Error(`BorgBackup does not support direct backup to ${config.destinationType.toUpperCase()}. Please use Restic for cloud storage.`);
    }

    let cmd = 'export TMPDIR=/tmp && export BORG_CACHE_DIR=/tmp/borg-cache && mkdir -p /var/tmp/borg-cache && ';

    // Borg requires passphrase - use both BORG_PASSPHRASE (for access) and BORG_NEW_PASSPHRASE (for init)
    if (!config.repoPassword) {
        throw new Error('BorgBackup requires a repository passphrase for encryption. Please set a passphrase in the job settings.');
    }

    cmd += `export BORG_PASSPHRASE="${config.repoPassword}" && `;
    cmd += `export BORG_NEW_PASSPHRASE="${config.repoPassword}" && `;

    // Create parent directory, then remove and reinitialize repo
    cmd += `mkdir -p $(dirname ${repoPath}) && `;
    cmd += `echo "Removing old repo at ${repoPath}..." && `;
    cmd += `rm -rf ${repoPath} 2>&1 && `;
    cmd += `echo "Initializing new Borg repo..." && `;
    cmd += `borg init --encryption=repokey-blake2 ${repoPath} 2>&1 && `;
    cmd += `echo "Creating backup..." && `;

    // Create backup
    cmd += `borg create --stats --progress --one-file-system --exclude-caches --exclude '${repoPath}' --exclude '/mnt' --exclude '/media' --exclude '/run/media' --exclude '/run' --exclude '/proc' --exclude '/sys' --exclude '/dev' ${repoPath}::${archiveName} ${config.sourcePaths.join(' ')}`;

    // Add pruning if retention is set
    if (config.retention) {
        cmd += ` && borg prune --stats ${repoPath}`;
        cmd += ` --keep-hourly ${config.retention.keepHourly}`;
        cmd += ` --keep-daily ${config.retention.keepDaily}`;
        cmd += ` --keep-weekly ${config.retention.keepWeekly}`;
        cmd += ` --keep-monthly ${config.retention.keepMonthly}`;
        cmd += ` --keep-yearly ${config.retention.keepYearly}`;
    }

    return cmd;
};

export const buildBorgSnapshotListCommand = (config: BackupJobConfig): string => {
    const repoPath = config.destinationPath;
    let cmd = 'export TMPDIR=/tmp && ';

    if (config.repoPassword) {
        cmd += `export BORG_PASSPHRASE="${config.repoPassword}" && `;
    }

    // borg list --json returns detailed archive info
    cmd += `borg list --json ${repoPath}`;
    return cmd;
};

export const buildBorgFileListCommand = (config: BackupJobConfig, snapshotId: string): string => {
    const repoPath = config.destinationPath;
    let cmd = 'export TMPDIR=/tmp && ';
    if (config.repoPassword) {
        cmd += `export BORG_PASSPHRASE="${config.repoPassword}" && `;
    }
    // List files in json format
    cmd += `borg list --json-lines ${repoPath}::${snapshotId}`;
    return cmd;
};

export const buildBorgRestoreCommand = (config: BackupJobConfig, snapshotId: string, restorePath: string, paths?: string[]): string => {
    const repoPath = config.destinationPath;
    let cmd = 'export TMPDIR=/tmp && ';

    if (config.repoPassword) {
        cmd += `export BORG_PASSPHRASE="${config.repoPassword}" && `;
    }

    // Borg extract needs to be run in the target directory
    // Using --sparse for efficiency, no --list (writes to stderr causing confusion)
    // Redirecting stderr to stdout so we see all output, and using || true to not fail on "File exists" warnings
    cmd += `mkdir -p ${restorePath} && cd ${restorePath} && borg extract --sparse ${repoPath}::${snapshotId}`;

    // Add specific paths if provided
    if (paths && paths.length > 0) {
        cmd += ` ${paths.map(p => `'${p}'`).join(' ')}`;
    }

    // Borg returns exit code 1 for warnings (like existing files) but files are still extracted
    // We consider this a success for restore purposes
    cmd += ' 2>&1; exit 0';

    return cmd;
};
