/**
 * Jobs Routes - Backup job CRUD, execution, and log streaming
 */

import { Router } from 'express';
import crypto from 'crypto';
import * as db from '../db/index.js';
import { authenticateToken, requireAdmin, getJwtSecret } from '../middleware/auth.js';
import { toAPIJob, toDBJob } from '../utils/mappers.js';
import { buildJobExecutionContext } from '../services/backup/jobContext.js';
import { encrypt } from '../encryption.js';
import { runBackupJob, runRestoreJob, listJobSnapshots, listJobFiles, BackupExecutionLog } from '../services/backup/index.js';
import { subscribeToJobLogs, broadcastJobLog, notifyJobComplete } from '../logStreamer.js';

const router = Router();

// Get all jobs
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const jobs = await db.getAllJobs();
        res.json(jobs.map(toAPIJob));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Create job
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
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
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const job = { ...req.body, id: req.params.id };
        const existing = await db.getJob(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Job not found' });
        const dbJob = toDBJob(job);
        if (!dbJob.repo_password) dbJob.repo_password = existing.repo_password;

        // Encrypt repo password if present and not already encrypted
        if (req.body.repoPassword && dbJob.repo_password) {
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
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await db.deleteJob(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Run a backup job via SSH on the source system
router.post('/:id/run', authenticateToken, requireAdmin, async (req, res) => {
    let claimed = false;
    try {
        const jobId = req.params.id;

        // Get job details
        const job = await db.getJob(jobId);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const leased = await db.getOne<{id:string}>(`
            UPDATE jobs SET status='Running'
            WHERE id=? AND COALESCE(status,'Idle')!='Running' RETURNING id`,[jobId]);
        if (!leased) return res.status(409).json({ error: 'Backup is already running' });
        claimed = true;

        const { sshConfig, jobConfig } = await buildJobExecutionContext(job, req.body);

        // Collect logs
        const logs: BackupExecutionLog[] = [];

        // Run backup with live log streaming
        const result = await runBackupJob(sshConfig, jobConfig, (log) => {
            if(logs.length>=2000) logs.shift();
            logs.push(log);
            console.log(`[Job] [${log.type}] ${log.message}`);
            // Broadcast to SSE subscribers
            broadcastJobLog(jobId, log.type as any, log.message);
        });

        if (!result.success) {
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

            return res.status(500).json({
                success: false,
                error: result.errors.join(', '),
                logs
            });
        }

        // Happy Path: Job Success
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
            job: toAPIJob(updatedJob),
            stats: {
                filesProcessed: result.filesProcessed,
                bytesProcessed: result.bytesProcessed,
                duration: (result.endTime.getTime() - result.startTime.getTime()) / 1000
            },
            logs
        });
    } catch (error: any) {
        if (claimed) {
            try { await db.run("UPDATE jobs SET status='Failed',last_run=? WHERE id=?",
                [new Date().toISOString(),req.params.id]); }
            catch { /* Keep original failure and surface error status. */ }
        }
        console.error('[Job] Error:', error instanceof Error ? error.message : 'Backup error');
        res.status(500).json({ error: 'Backup operation failed' });
    }
});

// Get job logs
router.get('/:jobId/logs', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const logs = await db.getJobLogs(req.params.jobId);
        res.json(logs);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// SSE endpoint for live job log streaming
router.get('/:jobId/logs/stream', authenticateToken, requireAdmin, (req, res) => {
    const jobId = req.params.jobId;
    console.log(`[SSE] Client subscribed to job ${jobId} logs`);
    subscribeToJobLogs(jobId, res);
});

// List snapshots for a job
router.get('/:id/snapshots', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const jobId = req.params.id;
        console.log(`[API] Listing snapshots for job ${jobId}`);
        const job = await db.getJob(jobId);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        const { sshConfig, jobConfig } = await buildJobExecutionContext(job);

        const snapshots = await listJobSnapshots(sshConfig, jobConfig);
        res.json(snapshots);

    } catch (error: any) {
        console.error('[Snapshots] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// List files in a snapshot
router.get('/:id/snapshots/:snapshotId/files', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id, snapshotId } = req.params;
        const job = await db.getJob(id);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        const { sshConfig, jobConfig } = await buildJobExecutionContext(job);

        const files = await listJobFiles(sshConfig, jobConfig, snapshotId);
        res.json(files);

    } catch (error: any) {
        console.error('[Files] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Restore a snapshot
router.post('/:id/restore', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const jobId = req.params.id;
        const { snapshotId, restorePath, systemId, paths } = req.body; // paths optional

        if (!snapshotId || !restorePath) {
            return res.status(400).json({ error: 'snapshotId and restorePath are required' });
        }

        const job = await db.getJob(jobId);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        const {sshConfig,jobConfig}=await buildJobExecutionContext(job, {}, systemId);
        const restoreConfig={...jobConfig,snapshotId,restorePath,paths};

        const logs: BackupExecutionLog[] = [];

        // This runs the restore
        const result = await runRestoreJob(sshConfig, restoreConfig, (log) => {
            if(logs.length>=2000) logs.shift();
            logs.push(log);
            console.log(`[Restore] [${log.type}] ${log.message}`);
            broadcastJobLog(jobId, log.type as any, '[RESTORE] ' + log.message);
        });

        // Save logs
        const runId = crypto.randomUUID();
        await db.saveJobLogs(jobId, runId, logs);

        if (!result.success) {
            return res.status(500).json({ success: false, error: result.errors.join(', '), logs });
        }

        // Happy Path: Restore Success
        res.json({ success: true, logs });

    } catch (error: any) {
        console.error('[Restore] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
