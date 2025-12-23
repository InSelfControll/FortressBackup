/**
 * Jobs Routes - Backup job CRUD, execution, and log streaming
 */

import { Router } from 'express';
import crypto from 'crypto';
import * as db from '../db/index.js';
import { authenticateToken, getJwtSecret } from '../middleware/auth.js';
import { toAPIJob, toDBJob } from '../utils/mappers.js';
import { resolveSSHCredentialsFromRequest } from '../utils/sshCredentials.js';
import { encrypt, decrypt } from '../encryption.js';
import { runBackupJob, runRestoreJob, listJobSnapshots, listJobFiles, BackupExecutionLog } from '../services/backup/index.js';
import { subscribeToJobLogs, broadcastJobLog, notifyJobComplete } from '../logStreamer.js';

const router = Router();

// Get all jobs
router.get('/', authenticateToken, async (req, res) => {
    try {
        const jobs = await db.getAllJobs();
        res.json(jobs.map(toAPIJob));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Create job
router.post('/', authenticateToken, async (req, res) => {
    try {
        const jobId = req.body.id || crypto.randomUUID();

        // Validation
        if (!req.body.sourceId) {
            return res.status(400).json({ error: 'Source System ID is required' });
        }

        const job = { ...req.body, id: jobId };
        const dbJob = toDBJob(job);

        // Encrypt repo password if present
        if (dbJob.repo_password) {
            const encrypted = encrypt(dbJob.repo_password, getJwtSecret());
            dbJob.repo_password = JSON.stringify(encrypted);
        }

        await db.saveJob(dbJob);
        res.json(toAPIJob(dbJob));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update job
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const job = { ...req.body, id: req.params.id };
        const dbJob = toDBJob(job);

        // Encrypt repo password if present and not already encrypted
        if (dbJob.repo_password && !JSON.stringify(dbJob.repo_password).includes('ciphertext')) {
            const encrypted = encrypt(dbJob.repo_password, getJwtSecret());
            dbJob.repo_password = JSON.stringify(encrypted);
        }

        await db.saveJob(dbJob);
        res.json(toAPIJob(dbJob));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete job
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        await db.deleteJob(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Run a backup job via SSH on the source system
router.post('/:id/run', authenticateToken, async (req, res) => {
    try {
        const jobId = req.params.id;

        // Get job details
        const job = await db.getJob(jobId);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const apiJob = toAPIJob(job);

        // Get source system
        const sourceSystem = await db.getSystem(apiJob.sourceId);
        if (!sourceSystem) {
            return res.status(404).json({ error: 'Source system not found' });
        }

        console.log(`[Job Run] Source System: ${sourceSystem.name} (ID: ${sourceSystem.id})`);
        console.log(`[Job Run] SSH Key ID from System: ${sourceSystem.ssh_key_id}`);

        // Resolve SSH credentials
        const credentials = await resolveSSHCredentialsFromRequest(req.body, sourceSystem.ssh_key_id);

        // Get destination location
        const destination = await db.getLocation(apiJob.destinationId);
        if (!destination) {
            return res.status(404).json({ error: `Destination location not found (ID: ${apiJob.destinationId})` });
        }

        // Prepare SSH config
        const sshConfig = {
            host: sourceSystem.host,
            port: sourceSystem.port || 22,
            username: sourceSystem.username || 'root',
            privateKey: credentials.privateKey,
            passphrase: credentials.passphrase,
            password: credentials.password
        };

        // Prepare job config
        const toolMapping: Record<string, 'borg' | 'restic' | 'rsync'> = {
            'BorgBackup': 'borg',
            'Restic': 'restic',
            'Rsync': 'rsync'
        };

        const jobConfig = {
            jobId: apiJob.id,
            jobName: apiJob.name.replace(/\s+/g, '_'),
            tool: toolMapping[apiJob.tool] || apiJob.tool.toLowerCase(),
            sourcePaths: apiJob.sourcePaths || ['/home'],
            destinationType: destination.type as any,
            destinationPath: destination.path,
            destinationEndpoint: destination.endpoint,
            destinationRegion: destination.region,
            destinationAccessKey: destination.access_key,
            destinationSecretKey: destination.secret_key,
            repoPassword: apiJob.repoPassword ? decrypt(JSON.parse(apiJob.repoPassword), getJwtSecret()) : undefined,
            retention: apiJob.retention
        };

        // Collect logs
        const logs: BackupExecutionLog[] = [];

        // Run backup with live log streaming
        const result = await runBackupJob(sshConfig, jobConfig, (log) => {
            logs.push(log);
            console.log(`[Job] [${log.type}] ${log.message}`);
            // Broadcast to SSE subscribers
            broadcastJobLog(jobId, log.type as any, log.message);
        });

        if (result.success) {
            // Update job status
            const updatedJob = {
                ...job,
                status: 'Success',
                last_run: new Date().toISOString(),
                size: result.bytesProcessed ? `${(result.bytesProcessed / 1e6).toFixed(2)} MB` : undefined
            };
            await db.saveJob(updatedJob);

            // Save logs to database
            const runId = crypto.randomUUID();
            await db.saveJobLogs(job.id, runId, logs);

            // Notify SSE subscribers that job completed
            notifyJobComplete(jobId, true);

            res.json({
                success: true,
                job: updatedJob,
                stats: {
                    filesProcessed: result.filesProcessed,
                    bytesProcessed: result.bytesProcessed,
                    duration: (result.endTime.getTime() - result.startTime.getTime()) / 1000
                },
                logs
            });
        } else {
            // Update job as failed
            const updatedJob = {
                ...job,
                status: 'Failed',
                last_run: new Date().toISOString()
            };
            await db.saveJob(updatedJob);

            // Save logs to database
            const runId = crypto.randomUUID();
            await db.saveJobLogs(job.id, runId, logs);

            // Notify SSE subscribers that job failed
            notifyJobComplete(jobId, false);

            res.status(500).json({
                success: false,
                error: result.errors.join(', '),
                logs
            });
        }
    } catch (error: any) {
        console.error('[Job] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get job logs
router.get('/:jobId/logs', async (req, res) => {
    try {
        const logs = await db.getJobLogs(req.params.jobId);
        res.json(logs);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// SSE endpoint for live job log streaming
router.get('/:jobId/logs/stream', (req, res) => {
    const jobId = req.params.jobId;
    console.log(`[SSE] Client subscribed to job ${jobId} logs`);
    subscribeToJobLogs(jobId, res);
});

// List snapshots for a job
router.get('/:id/snapshots', authenticateToken, async (req, res) => {
    try {
        const jobId = req.params.id;
        console.log(`[API] Listing snapshots for job ${jobId}`);
        const job = await db.getJob(jobId);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        const apiJob = toAPIJob(job);
        const sourceSystem = await db.getSystem(apiJob.sourceId);
        if (!sourceSystem) return res.status(404).json({ error: 'Source system not found' });

        const credentials = await resolveSSHCredentialsFromRequest({}, sourceSystem.ssh_key_id);
        const destination = await db.getLocation(apiJob.destinationId);
        if (!destination) return res.status(404).json({ error: 'Destination not found' });

        const sshConfig = {
            host: sourceSystem.host,
            port: sourceSystem.port || 22,
            username: sourceSystem.username || 'root',
            privateKey: credentials.privateKey,
            passphrase: credentials.passphrase,
            password: credentials.password
        };

        const toolMapping: Record<string, 'borg' | 'restic' | 'rsync'> = {
            'BorgBackup': 'borg',
            'Restic': 'restic',
            'Rsync': 'rsync'
        };

        const jobConfig = {
            jobId: apiJob.id,
            jobName: apiJob.name.replace(/\s+/g, '_'),
            tool: toolMapping[apiJob.tool] || apiJob.tool.toLowerCase() as any,
            sourcePaths: apiJob.sourcePaths || ['/home'],
            destinationType: destination.type as any,
            destinationPath: destination.path,
            destinationEndpoint: destination.endpoint,
            destinationRegion: destination.region,
            destinationAccessKey: destination.access_key,
            destinationSecretKey: destination.secret_key,
            repoPassword: apiJob.repoPassword ? decrypt(JSON.parse(apiJob.repoPassword), getJwtSecret()) : undefined,
            retention: apiJob.retention
        };

        const snapshots = await listJobSnapshots(sshConfig, jobConfig);
        res.json(snapshots);

    } catch (error: any) {
        console.error('[Snapshots] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// List files in a snapshot
router.get('/:id/snapshots/:snapshotId/files', authenticateToken, async (req, res) => {
    try {
        const { id, snapshotId } = req.params;
        const job = await db.getJob(id);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        const apiJob = toAPIJob(job);
        const sourceSystem = await db.getSystem(apiJob.sourceId);
        if (!sourceSystem) return res.status(404).json({ error: 'Source system not found' });

        const credentials = await resolveSSHCredentialsFromRequest({}, sourceSystem.ssh_key_id);
        const destination = await db.getLocation(apiJob.destinationId);
        if (!destination) return res.status(404).json({ error: 'Destination not found' });

        const sshConfig = {
            host: sourceSystem.host,
            port: sourceSystem.port || 22,
            username: sourceSystem.username || 'root',
            privateKey: credentials.privateKey,
            passphrase: credentials.passphrase,
            password: credentials.password
        };

        const toolMapping: Record<string, 'borg' | 'restic' | 'rsync'> = {
            'BorgBackup': 'borg', 'Restic': 'restic', 'Rsync': 'rsync'
        };

        const jobConfig = {
            jobId: apiJob.id,
            jobName: apiJob.name.replace(/\s+/g, '_'),
            tool: toolMapping[apiJob.tool] || apiJob.tool.toLowerCase() as any,
            sourcePaths: apiJob.sourcePaths || ['/home'],
            destinationType: destination.type as any,
            destinationPath: destination.path,
            destinationEndpoint: destination.endpoint,
            destinationRegion: destination.region,
            destinationAccessKey: destination.access_key,
            destinationSecretKey: destination.secret_key,
            repoPassword: apiJob.repoPassword ? decrypt(JSON.parse(apiJob.repoPassword), getJwtSecret()) : undefined,
        };

        const files = await listJobFiles(sshConfig, jobConfig, snapshotId);
        res.json(files);

    } catch (error: any) {
        console.error('[Files] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Restore a snapshot
router.post('/:id/restore', authenticateToken, async (req, res) => {
    try {
        const jobId = req.params.id;
        const { snapshotId, restorePath, systemId, paths } = req.body; // paths optional

        if (!snapshotId || !restorePath) {
            return res.status(400).json({ error: 'snapshotId and restorePath are required' });
        }

        const job = await db.getJob(jobId);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        const apiJob = toAPIJob(job);

        // Use provided systemId (target system) or default to source system
        const targetSystemId = systemId || apiJob.sourceId;
        const targetSystem = await db.getSystem(targetSystemId);
        if (!targetSystem) return res.status(404).json({ error: 'Target system not found' });

        const credentials = await resolveSSHCredentialsFromRequest({}, targetSystem.ssh_key_id);
        const destination = await db.getLocation(apiJob.destinationId);
        if (!destination) return res.status(404).json({ error: 'Destination not found' });

        const sshConfig = {
            host: targetSystem.host,
            port: targetSystem.port || 22,
            username: targetSystem.username || 'root',
            privateKey: credentials.privateKey,
            passphrase: credentials.passphrase,
            password: credentials.password
        };

        const toolMapping: Record<string, 'borg' | 'restic' | 'rsync'> = {
            'BorgBackup': 'borg',
            'Restic': 'restic',
            'Rsync': 'rsync'
        };

        const restoreConfig = {
            jobId: apiJob.id,
            jobName: apiJob.name.replace(/\s+/g, '_'),
            tool: toolMapping[apiJob.tool] || apiJob.tool.toLowerCase() as any,
            sourcePaths: apiJob.sourcePaths || ['/home'],
            destinationType: destination.type as any,
            destinationPath: destination.path,
            destinationEndpoint: destination.endpoint,
            destinationRegion: destination.region,
            destinationAccessKey: destination.access_key,
            destinationSecretKey: destination.secret_key,
            repoPassword: apiJob.repoPassword ? decrypt(JSON.parse(apiJob.repoPassword), getJwtSecret()) : undefined,
            snapshotId,
            restorePath,
            paths // Pass specific paths
        };

        const logs: BackupExecutionLog[] = [];

        // This runs the restore
        const result = await runRestoreJob(sshConfig, restoreConfig, (log) => {
            logs.push(log);
            console.log(`[Restore] [${log.type}] ${log.message}`);
            broadcastJobLog(jobId, log.type as any, '[RESTORE] ' + log.message);
        });

        // Save logs
        const runId = crypto.randomUUID();
        await db.saveJobLogs(jobId, runId, logs);

        if (result.success) {
            res.json({ success: true, logs });
        } else {
            res.status(500).json({ success: false, error: result.errors.join(', '), logs });
        }

    } catch (error: any) {
        console.error('[Restore] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
