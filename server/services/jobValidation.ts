import {parseCron} from './cron.js';
import * as db from '../db/index.js';
import { absoluteSources } from './backup/commandSafety.js';
export async function jobValidationError(job: any, existing?: db.Job): Promise<string | null> {
    if (!job || typeof job.name !== 'string' || !job.name.trim() || job.name.length > 120) return 'Enter a job name of 1–120 characters';
    if (!['BorgBackup','Restic','Rsync'].includes(job.tool)) return 'Choose a supported backup tool: BorgBackup, Restic, or Rsync';
    if (typeof job.sourceId !== 'string' || !await db.getSystem(job.sourceId)) return 'Select an existing source system';
    const location = typeof job.destinationId === 'string' ? await db.getLocation(job.destinationId) : null;
    if (!location) return 'Select an existing destination location';
    const supported: Record<string,string[]> = {BorgBackup:['nfs','sftp'],Restic:['nfs','sftp','s3','b2'],Rsync:['nfs','sftp']};
    if (!supported[job.tool].includes(location.type)) return 'This storage type is not supported by the selected backup tool';
    try { absoluteSources(job.sourcePaths); } catch(error) { return error instanceof Error ? error.message : 'Invalid source paths'; }
    if (job.scheduleEnabled !== undefined && typeof job.scheduleEnabled !== 'boolean') return 'Invalid scheduling flag';
    if (job.schedule !== undefined) { try { parseCron(job.schedule); } catch(error) { return error instanceof Error ? error.message : 'Invalid cron expression'; } }
    if (job.scheduleEnabled) {
        const source = await db.getSystem(job.sourceId);
        if (!source?.ssh_key_id || !source.host_fingerprint) return 'Assign a saved SSH identity and verified source host key before enabling automatic backups';
        if (job.tool === 'Rsync' && location.type === 'nfs' && !source.host_public_key) return 'Save the source host public key before scheduling Rsync';
        if (job.tool !== 'Rsync' && !(job.repoPassword || job.repo_password || existing?.repo_password)) return 'Save a repository passphrase before enabling automatic backups';
        if (['sftp','s3','b2'].includes(location.type) && !location.secret_key) return 'Save destination credentials before enabling automatic backups';
    }
    if (job.schedule !== undefined && (typeof job.schedule !== 'string' || job.schedule.length > 120 || job.schedule.trim().split(/\s+/).length !== 5 || !/^[0-9*/?,\s-]+$/.test(job.schedule))) return 'Enter a five-field cron expression';
    if (job.priority !== undefined && !['High','Medium','Low'].includes(job.priority)) return 'Invalid job priority';
    if (job.repoPassword !== undefined && (typeof job.repoPassword !== 'string' || job.repoPassword.length > 4096)) return 'Invalid repository passphrase';
    if (job.retention !== undefined && (!job.retention || typeof job.retention !== 'object' || Object.values(job.retention).some(value=>!Number.isInteger(value) || Number(value)<0 || Number(value)>10000))) return 'Retention values must be non-negative integers up to 10000';
    return null;
}
