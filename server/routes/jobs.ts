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
import { runBackupJob, runRestoreJob, listJobSnapshots, listJobFiles, BackupExecutionLog, withBackupProcessContext, reconcileRecordedProcessGroups } from '../services/backup/index.js';
import { subscribeToJobLogs, broadcastJobLog, notifyJobComplete } from '../logStreamer.js';
import { appendBoundedJobLog } from '../utils/boundedLog.js';

const router = Router();

const normalizeRepoPassword = (body: any) => ({
    ...body,
    repoPassword: body.repoPassword ?? body.repo_password
});

export async function completeRunningJob(
    jobId: string,
    runEpoch: number,
    status: 'Success' | 'Failed',
    size?: string
): Promise<boolean> {
    const lastRun = new Date().toISOString();
    if (status === 'Success') {
        return Boolean(await db.getOne(`UPDATE jobs SET status='Success',last_run=?,size=?
            WHERE id=? AND status='Running' AND run_epoch=? RETURNING id`,
            [lastRun, size ?? null, jobId, runEpoch]));
    }
    return Boolean(await db.getOne(`UPDATE jobs SET status='Failed',last_run=?
        WHERE id=? AND status='Running' AND run_epoch=? RETURNING id`, [lastRun, jobId, runEpoch]));
}

export async function recoverInterruptedRuns(): Promise<void> {
    const interrupted = await db.query<{id:string;run_epoch:number}>(
        `SELECT id,run_epoch FROM jobs WHERE status='Running'`
    );
    for (const job of interrupted) {
        const reconciled = await reconcileRecordedProcessGroups(job.id, job.run_epoch);
        if (reconciled) {
            await db.run(`UPDATE jobs SET status='Failed',last_run=?
                WHERE id=? AND status='Running' AND run_epoch=?`,
                [new Date().toISOString(), job.id, job.run_epoch]);
            continue;
        }
        await db.run(`UPDATE jobs SET status='ReviewRequired'
            WHERE id=? AND status='Running' AND run_epoch=?`, [job.id, job.run_epoch]);
        console.warn(`[Job] Operator review required before restarting job ${job.id}`);
    }
}

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

        const job = { ...normalizeRepoPassword(req.body), id: jobId };
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
        const existing = await db.getJob(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Job not found' });
        if (existing.status === 'Running') {
            return res.status(409).json({ error: 'Cannot edit a job while it is running' });
        }
        const body = normalizeRepoPassword(req.body);
        const job = { ...body, id: req.params.id };
        const dbJob = toDBJob(job);
        if (!dbJob.repo_password) dbJob.repo_password = existing.repo_password;

        // Encrypt repo password if present and not already encrypted
        if (body.repoPassword && dbJob.repo_password) {
            const encrypted = encrypt(dbJob.repo_password, getJwtSecret());
            dbJob.repo_password = JSON.stringify(encrypted);
        }

        const updated = await db.getOne<any>(`
            UPDATE jobs SET name=?,tool=?,source_id=?,destination_id=?,source_path=?,
                repo_password=?,schedule=?,retention=?,priority=?,status=?,next_run=?,last_run=?,size=?,stats=?
            WHERE id=? AND COALESCE(status,'Idle')!='Running' RETURNING *`,
            [dbJob.name, dbJob.tool, dbJob.source_id, dbJob.destination_id, dbJob.source_path,
                dbJob.repo_password, dbJob.schedule, dbJob.retention, dbJob.priority, dbJob.status,
                dbJob.next_run, dbJob.last_run, dbJob.size, dbJob.stats, dbJob.id]);
        if (!updated) return res.status(409).json({ error: 'Cannot edit a job while it is running' });
        res.json(toAPIJob(updated));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete job
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const existing = await db.getJob(req.params.id);
        if (existing?.status === 'Running') {
            return res.status(409).json({ error: 'Cannot delete a job while it is running' });
        }
        const deleted = await db.getOne<{id:string}>(`
            DELETE FROM jobs WHERE id=? AND COALESCE(status,'Idle')!='Running' RETURNING id`,
            [req.params.id]);
        if (existing && !deleted) {
            return res.status(409).json({ error: 'Cannot delete a job while it is running' });
        }
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Run a backup job via SSH on the source system
router.post('/:id/run', authenticateToken, requireAdmin, async (req, res) => {
    let runEpoch: number | null = null;
    try {
        const jobId = req.params.id;

        // Get job details
        const job = await db.getJob(jobId);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const leased = await db.getOne<{run_epoch:number}>(`
            UPDATE jobs SET status='Running',run_epoch=COALESCE(run_epoch,0)+1
            WHERE id=? AND COALESCE(status,'Idle') IN ('Idle','Success','Failed') RETURNING run_epoch`,[jobId]);
        if (!leased) return res.status(409).json({ error: 'Backup is already running or requires operator review' });
        runEpoch = leased.run_epoch;

        const { sshConfig, jobConfig } = await buildJobExecutionContext(job, req.body);

        // Collect logs
        const logs: BackupExecutionLog[] = [];

        // Run backup with live log streaming
        const result = await withBackupProcessContext({ jobId, runEpoch }, () => runBackupJob(sshConfig, jobConfig, (log) => {
            if(logs.length>=2000) logs.shift();
            appendBoundedJobLog(logs,log);
            console.log(`[Job] [${log.type}] ${log.message}`);
            // Broadcast to SSE subscribers
            broadcastJobLog(jobId, log.type as any, log.message);
        }));

        if (!result.success) {
            const completed = await completeRunningJob(jobId, runEpoch, 'Failed');

            // Save logs to database
            const runId = crypto.randomUUID();
            await db.saveJobLogs(job.id, runId, logs);

            // Notify SSE subscribers that job failed
            if (completed) notifyJobComplete(jobId, false);

            return res.status(500).json({
                success: false,
                error: result.errors.join(', '),
                logs
            });
        }

        // Happy Path: Job Success
        const size = result.bytesProcessed ? `${(result.bytesProcessed / 1e6).toFixed(2)} MB` : undefined;
        const completed = await completeRunningJob(jobId, runEpoch, 'Success', size);
        const updatedJob = await db.getJob(jobId);

        // Save logs to database
        const runId = crypto.randomUUID();
        await db.saveJobLogs(job.id, runId, logs);

        // Notify SSE subscribers that job completed
        if (completed) notifyJobComplete(jobId, true);

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
        if (runEpoch !== null) {
            try { await completeRunningJob(req.params.id, runEpoch, 'Failed'); }
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
router.get('/:jobId/logs/stream', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const jobId=req.params.jobId;
        if (typeof jobId!=='string' || !/^[0-9a-f-]{36}$/i.test(jobId))
            return res.status(400).json({error:'Invalid job identifier'});
        if(!await db.getJob(jobId))return res.sendStatus(404);
        subscribeToJobLogs(jobId,res);
    }catch {
        if(!res.headersSent)res.status(500).json({error:'Cannot subscribe to backup logs'});
    }
});

// List snapshots for a job
router.get('/:id/snapshots', authenticateToken, requireAdmin, async (req, res) => {
    const controller = new AbortController();
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', abort);
    try {
        const jobId = req.params.id;
        console.log(`[API] Listing snapshots for job ${jobId}`);
        const job = await db.getJob(jobId);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        const { sshConfig, jobConfig } = await buildJobExecutionContext(job);

        const snapshots = await listJobSnapshots(sshConfig, jobConfig, controller.signal);
        res.json(snapshots);

    } catch (error: any) {
        console.error('[Snapshots] Error:', error);
        if (!res.destroyed) res.status(500).json({ error: error.message });
    } finally {
        res.off('close', abort);
    }
});

// List files in a snapshot
router.get('/:id/snapshots/:snapshotId/files', authenticateToken, requireAdmin, async (req, res) => {
    const controller = new AbortController();
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', abort);
    try {
        const { id, snapshotId } = req.params;
        const job = await db.getJob(id);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        const { sshConfig, jobConfig } = await buildJobExecutionContext(job);

        const files = await listJobFiles(sshConfig, jobConfig, snapshotId, controller.signal);
        res.json(files);

    } catch (error: any) {
        console.error('[Files] Error:', error);
        if (!res.destroyed) res.status(500).json({ error: error.message });
    } finally {
        res.off('close', abort);
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
        if (paths !== undefined && (!Array.isArray(paths) || paths.length === 0)) {
            return res.status(400).json({ error: 'paths must contain at least one restore selection' });
        }

        const job = await db.getJob(jobId);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        const {sshConfig,jobConfig}=await buildJobExecutionContext(job, {}, systemId);
        const restoreConfig={...jobConfig,snapshotId,restorePath,paths};

        const logs: BackupExecutionLog[] = [];

        // This runs the restore
        const result = await runRestoreJob(sshConfig, restoreConfig, (log) => {
            if(logs.length>=2000) logs.shift();
            appendBoundedJobLog(logs,log);
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
