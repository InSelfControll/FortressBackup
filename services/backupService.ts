/**
 * Fortress Backup Service
 * Core backup operations for executing backups via SSH.
 */

import { BackupJob, BackupTool, System, Location, JobStatus } from '../types';

export interface BackupResult {
    success: boolean;
    jobId: string;
    startTime: Date;
    endTime: Date;
    bytesTransferred?: number;
    filesProcessed?: number;
    dedupeRatio?: number;
    errors?: string[];
    snapshotId?: string;
}

export interface BackupProgress {
    jobId: string;
    status: 'preparing' | 'connecting' | 'transferring' | 'verifying' | 'complete' | 'failed';
    percent: number;
    currentFile?: string;
    bytesTransferred: number;
    bytesTotal?: number;
    speed?: number;
    eta?: number;
}

/**
 * Build the backup command based on tool type
 */
export const buildBackupCommand = (
    job: BackupJob,
    source: System,
    destination: Location
): string => {
    const { tool, retention } = job;

    switch (tool) {
        case BackupTool.BORG:
            return buildBorgCommand(job, source, destination);
        case BackupTool.RESTIC:
            return buildResticCommand(job, source, destination);
        case BackupTool.RSYNC:
            return buildRsyncCommand(job, source, destination);
        case BackupTool.RCLONE:
            return buildRcloneCommand(job, source, destination);
        default:
            throw new Error(`Unsupported backup tool: ${tool}`);
    }
};

const buildBorgCommand = (job: BackupJob, source: System, destination: Location): string => {
    const { retention } = job;
    const repoPath = `${destination.path}/${job.name.toLowerCase().replace(/\s+/g, '-')}`;

    const commands = [
        `# Initialize repository if needed`,
        `borg init --encryption=repokey-blake2 ${repoPath} 2>/dev/null || true`,
        ``,
        `# Create backup`,
        `borg create --stats --progress \\`,
        `  ${repoPath}::${job.name}-{now:%Y%m%d_%H%M%S} \\`,
        `  /`,
        ``,
        `# Prune old backups`,
        `borg prune --stats ${repoPath} \\`,
        retention.keepHourly > 0 ? `  --keep-hourly=${retention.keepHourly} \\` : '',
        retention.keepDaily > 0 ? `  --keep-daily=${retention.keepDaily} \\` : '',
        retention.keepWeekly > 0 ? `  --keep-weekly=${retention.keepWeekly} \\` : '',
        retention.keepMonthly > 0 ? `  --keep-monthly=${retention.keepMonthly} \\` : '',
        retention.keepYearly > 0 ? `  --keep-yearly=${retention.keepYearly}` : '',
    ].filter(Boolean).join('\n');

    return commands;
};

const buildResticCommand = (job: BackupJob, source: System, destination: Location): string => {
    const { retention } = job;
    let repoPrefix = '';

    switch (destination.type) {
        case 's3':
            repoPrefix = `s3:${destination.endpoint || 's3.amazonaws.com'}/${destination.path}`;
            break;
        case 'b2':
            repoPrefix = `b2:${destination.path}`;
            break;
        case 'sftp':
            repoPrefix = `sftp:${destination.endpoint}:${destination.path}`;
            break;
        default:
            repoPrefix = destination.path;
    }

    const commands = [
        `# Set environment variables`,
        destination.type === 's3' ? `export AWS_ACCESS_KEY_ID="${destination.accessKey}"` : '',
        destination.type === 's3' ? `export AWS_SECRET_ACCESS_KEY="${destination.secretKey}"` : '',
        `export RESTIC_REPOSITORY="${repoPrefix}"`,
        `export RESTIC_PASSWORD="$FORTRESS_RESTIC_PASSWORD"`,
        ``,
        `# Initialize repository if needed`,
        `restic init 2>/dev/null || true`,
        ``,
        `# Create backup`,
        `restic backup --verbose /`,
        ``,
        `# Apply retention policy`,
        `restic forget --prune \\`,
        retention.keepHourly > 0 ? `  --keep-hourly ${retention.keepHourly} \\` : '',
        retention.keepDaily > 0 ? `  --keep-daily ${retention.keepDaily} \\` : '',
        retention.keepWeekly > 0 ? `  --keep-weekly ${retention.keepWeekly} \\` : '',
        retention.keepMonthly > 0 ? `  --keep-monthly ${retention.keepMonthly} \\` : '',
        retention.keepYearly > 0 ? `  --keep-yearly ${retention.keepYearly}` : '',
    ].filter(Boolean).join('\n');

    return commands;
};

const buildRsyncCommand = (job: BackupJob, source: System, destination: Location): string => {
    let destPath = destination.path;

    if (destination.type === 'sftp') {
        destPath = `${destination.accessKey}@${destination.endpoint}:${destination.path}`;
    }

    return [
        `# Rsync backup`,
        `rsync -avz --progress --delete \\`,
        `  --exclude='.cache' \\`,
        `  --exclude='*.tmp' \\`,
        `  / ${destPath}/${job.name.toLowerCase().replace(/\s+/g, '-')}/`,
    ].join('\n');
};

const buildRcloneCommand = (job: BackupJob, source: System, destination: Location): string => {
    return [
        `# Rclone sync`,
        `rclone sync / ${destination.path}/${job.name.toLowerCase().replace(/\s+/g, '-')}/ \\`,
        `  --progress \\`,
        `  --transfers=4 \\`,
        `  --checkers=8 \\`,
        `  --fast-list`,
    ].join('\n');
};

/**
 * Simulate backup execution (for demo purposes)
 * In production, this would execute via SSH
 */
export const simulateBackup = async (
    job: BackupJob,
    onProgress?: (progress: BackupProgress) => void
): Promise<BackupResult> => {
    const startTime = new Date();
    const statuses: BackupProgress['status'][] = ['preparing', 'connecting', 'transferring', 'verifying', 'complete'];

    for (let i = 0; i < statuses.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));

        if (onProgress) {
            onProgress({
                jobId: job.id,
                status: statuses[i],
                percent: ((i + 1) / statuses.length) * 100,
                bytesTransferred: Math.floor(Math.random() * 1000000000),
                speed: Math.floor(Math.random() * 100) + 20
            });
        }
    }

    const endTime = new Date();
    const success = Math.random() > 0.1; // 90% success rate for demo

    return {
        success,
        jobId: job.id,
        startTime,
        endTime,
        bytesTransferred: Math.floor(Math.random() * 10000000000),
        filesProcessed: Math.floor(Math.random() * 50000),
        dedupeRatio: parseFloat((Math.random() * 5 + 1).toFixed(2)),
        snapshotId: success ? crypto.randomUUID().split('-')[0] : undefined,
        errors: success ? undefined : ['Connection timeout to remote host']
    };
};

/**
 * Generate SSH command to run backup on remote system
 */
export const generateSSHCommand = (
    system: System,
    script: string
): string => {
    return `ssh -o StrictHostKeyChecking=no ${system.username}@${system.host} -p ${system.port || 22} 'bash -s' << 'EOF'
${script}
EOF`;
};
