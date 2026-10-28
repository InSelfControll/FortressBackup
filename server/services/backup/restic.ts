/**
 * Restic command builder. All user-supplied values are POSIX shell-quoted.
 * Use a single target resolver for backup, listing, and restore.
 *
 * TODO: migrate remote execution to an argv/agent protocol so credentials
 * never appear inside the SSH command line.
 */
import { BackupJobConfig } from './types.js';
import { quote as sh, absoluteSources, absoluteRestorePath } from './commandSafety.js';

const getRepository = (config: BackupJobConfig): string => {
    const path = config.destinationPath;
    if (typeof path !== 'string' || !path || /[\u0000-\u001f\u007f]/.test(path)) throw new Error('Invalid repository path');
    switch (config.destinationType) {
        case 'sftp': return path.startsWith('sftp:') ? path : `sftp:${path}`;
        case 's3':
            return config.destinationEndpoint
                ? `s3:${config.destinationEndpoint}/${path}`
                : `s3:s3.${config.destinationRegion || 'us-east-1'}.amazonaws.com/${path}`;
        case 'b2': return `b2:${path}`;
        case 'nfs': return path;
        default: throw new Error('Unsupported Restic destination type');
    }
};

const resticPrefix = (config: BackupJobConfig): string => {
    const variables: Record<string, string | undefined> = {
        RESTIC_PASSWORD: config.repoPassword,
        AWS_ACCESS_KEY_ID: config.destinationType === 's3' ? config.destinationAccessKey : undefined,
        AWS_SECRET_ACCESS_KEY: config.destinationType === 's3' ? config.destinationSecretKey : undefined,
        B2_ACCOUNT_ID: config.destinationType === 'b2' ? config.destinationAccessKey : undefined,
        B2_ACCOUNT_KEY: config.destinationType === 'b2' ? config.destinationSecretKey : undefined,
    };
    const env = Object.entries(variables)
        .filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '')
        .map(([key, value]) => `${key}=${sh(value)}`).join(' ');
    return `${env ? env + ' ' : ''}restic -r ${sh(getRepository(config))}`;
};

const validSnapshot = (id: string): string => {
    if (!/^(?:latest|[0-9a-fA-F]{8,64})$/.test(id)) throw new Error('Invalid snapshot ID');
    return id;
};

export const buildResticCommand = (config: BackupJobConfig): string => {
    absoluteSources(config.sourcePaths);
    // Repository initialization is an explicit, separately verified operation.
    // In particular, NEVER swallow failures with restic init || true.
    const source = config.sourcePaths.map(sh).join(' ');
    return `${resticPrefix(config)} backup --one-file-system --exclude-caches --exclude=/proc --exclude=/sys --exclude=/dev -- ${source}`;
};

export const buildResticSnapshotListCommand = (config: BackupJobConfig): string =>
    `${resticPrefix(config)} snapshots --json`;

export const buildResticFileListCommand = (config: BackupJobConfig, snapshotId: string): string =>
    `${resticPrefix(config)} ls --json ${sh(validSnapshot(snapshotId))}`;

export const buildResticRestoreCommand = (
    config: BackupJobConfig, snapshotId: string, restorePath: string, paths?: string[]
): string => {
    absoluteRestorePath(restorePath);
    const includes = paths?.map(path => ` --include ${sh(path)}`).join('') || '';
    return `${resticPrefix(config)} restore ${sh(validSnapshot(snapshotId))} --target ${sh(restorePath)}${includes}`;
};
