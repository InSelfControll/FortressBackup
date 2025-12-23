/**
 * Backup Service Types
 */

export interface BackupExecutionLog {
    type: 'info' | 'success' | 'error' | 'progress' | 'stats';
    message: string;
    timestamp: Date;
}

export interface BackupResult {
    success: boolean;
    startTime: Date;
    endTime: Date;
    bytesProcessed?: number;
    filesProcessed?: number;
    errors: string[];
    logs: BackupExecutionLog[];
}

export interface BackupJobConfig {
    jobId: string;
    jobName: string;
    tool: 'borg' | 'restic' | 'rsync';
    sourcePaths: string[];
    destinationType: 's3' | 'sftp' | 'nfs' | 'b2' | 'gcs' | 'azure' | 'gdrive' | 'onedrive';
    destinationPath: string;
    destinationEndpoint?: string;
    destinationRegion?: string;
    destinationAccessKey?: string;
    destinationSecretKey?: string;
    repoPassword?: string; // For borg/restic encryption
    retention?: {
        keepHourly: number;
        keepDaily: number;
        keepWeekly: number;
        keepMonthly: number;
        keepYearly: number;
    };
}

export interface Snapshot {
    id: string;
    shortId: string;
    time: string;
    paths: string[];
    hostname: string;
    username?: string;
    tags?: string[];
}

export interface RestoreJobConfig extends BackupJobConfig {
    snapshotId: string;
    restorePath: string; // Directory to restore files into
}

export interface SSHConfig {
    host: string;
    port: number;
    username: string;
    privateKey?: string;
    passphrase?: string;
    password?: string;
}
