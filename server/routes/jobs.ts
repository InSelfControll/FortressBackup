/**
 * Jobs Routes - Backup job CRUD, execution, and log streaming
 */

import {cronMatches} from '../services/cron.js';
import { Router } from 'express';
import { jobValidationError } from '../services/jobValidation.js';
import crypto from 'crypto';
import {enqueueManagedJob} from './managedAgents.js';
import {managedRepository} from '../services/managedRepository.js';
import * as db from '../db/index.js';
import { authenticateToken, requireAdmin, getJwtSecret } from '../middleware/auth.js';
import { toAPIJob, toDBJob } from '../utils/mappers.js';
import { buildJobExecutionContext } from '../services/backup/jobContext.js';
import { encrypt } from '../encryption.js';
import { runBackupJob, runRestoreJob, listJobSnapshots, listJobFiles, BackupExecutionLog, withBackupProcessContext, reconcileRecordedProcessGroups, cancelRecordedJob } from '../services/backup/index.js';
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
    size?: string,
    stats?: Record<string,number>
): Promise<boolean> {
    const lastRun = new Date().toISOString();
    const canceled=await db.getOne(`UPDATE jobs SET status='Canceled',operation_at=? WHERE id=? AND status='Running' AND run_epoch=? AND cancel_requested=1 RETURNING id`,[lastRun,jobId,runEpoch]);
    if(canceled)return true;
    if (status === 'Success') {
        return Boolean(await db.getOne(`UPDATE jobs SET status='Success',last_run=?,size=?,stats=COALESCE(?,stats)
            WHERE id=? AND status='Running' AND run_epoch=? RETURNING id`,
            [lastRun, size ?? null, stats ? JSON.stringify(stats) : null, jobId, runEpoch]));
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
        const jobId = crypto.randomUUID();

        const invalid = await jobValidationError(req.body);
        if (invalid) return res.status(400).json({error:invalid});

        const job = { ...normalizeRepoPassword(req.body), id: jobId, status:'Idle' };
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
        const invalid = await jobValidationError({...req.body,scheduleEnabled:req.body.scheduleEnabled ?? Boolean(existing.schedule_enabled)},existing);
        if (invalid) return res.status(400).json({error:invalid});
        const body = normalizeRepoPassword(req.body);
        const job = { ...body, id: req.params.id };
        const dbJob = toDBJob(job);
        if (req.body.scheduleEnabled === undefined) dbJob.schedule_enabled = existing.schedule_enabled || 0;
        dbJob.status = existing.status; dbJob.last_run = existing.last_run; dbJob.stats = existing.stats; dbJob.size = existing.size;
        if (!dbJob.repo_password) dbJob.repo_password = existing.repo_password;

        // Encrypt repo password if present and not already encrypted
        if (body.repoPassword && dbJob.repo_password) {
            const encrypted = encrypt(dbJob.repo_password, getJwtSecret());
            dbJob.repo_password = JSON.stringify(encrypted);
        }

        const updated = await db.getOne<any>(`
            UPDATE jobs SET name=?,tool=?,source_id=?,destination_id=?,source_path=?,
                repo_password=?,schedule=?,retention=?,priority=?,status=?,next_run=?,last_run=?,size=?,stats=?,schedule_enabled=?
            WHERE id=? AND COALESCE(status,'Idle')!='Running' RETURNING *`,
            [dbJob.name, dbJob.tool, dbJob.source_id, dbJob.destination_id, dbJob.source_path,
                dbJob.repo_password, dbJob.schedule, dbJob.retention, dbJob.priority, dbJob.status,
                dbJob.next_run, dbJob.last_run, dbJob.size, dbJob.stats, dbJob.schedule_enabled, dbJob.id]);
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
        if (deleted) await db.run('DELETE FROM job_logs WHERE job_id=?',[req.params.id]);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Run a backup job via SSH on the source system
export async function executeSavedJob(jobId:string, credentials:Record<string,unknown>={}):Promise<{status:number;body:any}> {
    let runEpoch: number | null = null;
    try {

        // Get job details
        const job = await db.getJob(jobId);
        if (!job) {
            return {status:404,body:{error:'Job not found'}};
        }

        const leased = await db.getOne<{run_epoch:number}>(`
            UPDATE jobs SET status='Running',cancel_requested=0,operation='backup',operation_at=CURRENT_TIMESTAMP,run_epoch=COALESCE(run_epoch,0)+1
            WHERE id=? AND COALESCE(status,'Idle') IN ('Idle','Success','Failed','Warning','Canceled') RETURNING run_epoch`,[jobId]);
        if (!leased) return {status:409,body:{error:'Backup is already running or requires operator review'}};
        runEpoch = leased.run_epoch;

        const { sshConfig, jobConfig } = await buildJobExecutionContext(job, credentials);

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

            return {status:500,body:{
                success: false,
                error: result.errors.join(', '),
                logs
            }};
        }

        // Happy Path: Job Success
        const size = result.bytesProcessed ? `${(result.bytesProcessed / 1e6).toFixed(2)} MB` : undefined;
        const duration = (result.endTime.getTime() - result.startTime.getTime()) / 1000;
        const stats = { filesProcessed: result.filesProcessed || 0, bytesProcessed: result.bytesProcessed || 0, duration, speed: duration > 0 ? (result.bytesProcessed || 0) / 1e6 / duration : 0 };
        const completed = await completeRunningJob(jobId, runEpoch, 'Success', size, stats);
        const updatedJob = await db.getJob(jobId);

        // Save logs to database
        const runId = crypto.randomUUID();
        await db.saveJobLogs(job.id, runId, logs);

        // Notify SSE subscribers that job completed
        const wasCanceled=updatedJob?.status==='Canceled';
        if (completed) notifyJobComplete(jobId, !wasCanceled);

        return {status:200,body:{
            success: !wasCanceled,
            ...(wasCanceled?{canceled:true,error:'Operation canceled'}:{}),
            job: toAPIJob(updatedJob),
            stats,

            logs
        }};
    } catch (error: any) {
        if (runEpoch !== null) {
            try {
                const completed = await completeRunningJob(jobId, runEpoch, 'Failed');
                if (completed) {
                    const message = 'Backup could not start. Check the saved source SSH identity, host key, and repository configuration.';
                    await db.saveJobLogs(jobId,crypto.randomUUID(),[{type:'error',message,timestamp:new Date()}]);
                    broadcastJobLog(jobId,'error',message); notifyJobComplete(jobId,false);
                }
            }
            catch { /* Keep original failure and surface error status. */ }
        }
        console.error('[Job] Error:', error instanceof Error ? error.message : 'Backup error');
        return {status:500,body:{error:'Backup operation failed'}};
    }
}

router.post('/:id/run', authenticateToken, requireAdmin, async (req,res)=>{
    const result=await executeSavedJob(req.params.id,req.body || {});
    res.status(result.status).json(result.body);
});

export async function dispatchScheduledJobs(now=new Date(), execute=executeSavedJob):Promise<string[]> {
    const slot=new Date(Math.floor(now.getTime()/60000)*60000).toISOString();
    const candidates=await db.query<db.Job>("SELECT * FROM jobs WHERE schedule_enabled=1 AND status IN ('Idle','Success','Failed','Warning','Canceled')");
    const claimed:string[]=[];const work:Promise<unknown>[]=[];
    for(const job of candidates){
        try { if(!job.schedule || !cronMatches(job.schedule,now))continue; }
        catch { console.warn('[Job scheduler] Invalid saved cron expression for job',job.id);continue; }
        const claim=await db.getOne(`UPDATE jobs SET last_scheduled_for=? WHERE id=? AND schedule_enabled=1
            AND status IN ('Idle','Success','Failed','Warning','Canceled') AND (last_scheduled_for IS NULL OR last_scheduled_for!=?) RETURNING id`,[slot,job.id,slot]);
        if(!claim)continue;
        claimed.push(job.id);work.push(execute(job.id).catch(error=>console.error('[Job scheduler] Execution failed:',error instanceof Error?error.message:'unknown error')));
    }
    await Promise.allSettled(work);
    return claimed;
}

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

router.post('/:id/cancel',authenticateToken,requireAdmin,async(req,res,next)=>{
 try{
  const row=await db.getOne<{run_epoch:number}>("UPDATE jobs SET cancel_requested=1 WHERE id=? AND status='Running' RETURNING run_epoch",[req.params.id]);
  if(!row)return res.status(409).json({error:'No running operation to cancel'});
  cancelRecordedJob(req.params.id,row.run_epoch);res.status(202).json({cancelRequested:true});
 }catch(error){next(error)}
});

// Restore a snapshot
router.post('/:id/restore', authenticateToken, requireAdmin, async (req, res) => {
    const jobId=req.params.id;
    let epoch:number|null=null;
    const logs:BackupExecutionLog[]=[];
    const finish=async(success:boolean)=>{
        if(epoch===null)return;
        const completed=await db.getOne(`UPDATE jobs SET status=CASE WHEN cancel_requested=1 THEN 'Canceled' ELSE ? END,operation_at=? WHERE id=? AND status='Running' AND run_epoch=? RETURNING id`,[success?'Success':'Failed',new Date().toISOString(),jobId,epoch]);
        if(completed)notifyJobComplete(jobId,success);
    };
    try {
        const {snapshotId,restorePath,systemId,paths}=req.body??{};
        if(req.body?.managedAgentId){
            const job=await db.getJob(jobId);if(!job)return res.sendStatus(404);
            if(job.tool!=='Restic')return res.status(400).json({error:'Windows recovery requires a Restic backup'});
            const binding=await db.getOne<{job_id:string}>('SELECT job_id FROM managed_repositories WHERE client_id=?',[req.body.managedAgentId]);
            if(!binding)return res.status(409).json({error:'Assign this repository to the Windows destination first'});
            const source=await managedRepository(jobId),target=await managedRepository(binding.job_id);
            if(source.repository!==target.repository||source.password!==target.password)return res.status(409).json({error:'The Windows device is assigned to a different repository. Select this saved repository and Save and connect on that device first.'});
            const queued=await enqueueManagedJob(req.body.managedAgentId,{operation:'restore',request:{snapshotId,allDevices:true,...(paths===undefined?{}:{paths})}});
            return res.status(queued.status).json(queued.body);
        }

        if(typeof snapshotId!=='string'||typeof restorePath!=='string'||paths!==undefined&&(!Array.isArray(paths)||!paths.length||paths.length>100||!paths.every(path=>typeof path==='string'&&path.length<=4096)))return res.status(400).json({error:'Choose a snapshot, restore folder, and valid file selection'});
        const job=await db.getJob(jobId);
        if(!job)return res.status(404).json({error:'Job not found'});
        const lease=await db.getOne<{run_epoch:number}>(`UPDATE jobs SET status='Running',cancel_requested=0,operation='restore',operation_at=?,run_epoch=COALESCE(run_epoch,0)+1
            WHERE id=? AND COALESCE(status,'Idle') IN ('Idle','Success','Failed','Warning','Canceled') RETURNING run_epoch`,[new Date().toISOString(),jobId]);
        if(!lease)return res.status(409).json({error:'An operation is already running or requires operator review'});
        epoch=lease.run_epoch;
        const {sshConfig,jobConfig}=await buildJobExecutionContext(job,{},systemId);
        const result=await withBackupProcessContext({jobId,runEpoch:epoch},()=>runRestoreJob(sshConfig,{...jobConfig,snapshotId,restorePath,paths},log=>{
            if(logs.length>=2000)logs.shift();
            appendBoundedJobLog(logs,log);
            broadcastJobLog(jobId,log.type as any,'[RESTORE] '+log.message);
        }));
        await db.saveJobLogs(jobId,crypto.randomUUID(),logs);
        await finish(result.success);
        if((await db.getJob(jobId))?.status==='Canceled')return res.json({success:false,canceled:true,error:'Restore canceled',logs});
        res.status(result.success?200:500).json({success:result.success,...(result.success?{}:{error:result.errors.join(', ')}),logs});
    }catch(error){
        await finish(false);
        res.status(500).json({error:error instanceof Error?error.message:'Restore failed'});
    }
});

export default router;
