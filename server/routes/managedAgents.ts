import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import { getOne, query, run } from '../db/helpers.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import type {ManagedOperation,ManagedRequest} from '../../types';
import {managedRequest,managedResult,recoveryCapability} from '../services/managedRecovery.js';
import {managedRepository} from '../services/managedRepository.js';

// Source folders and executable commands remain local. Setup credentials are
// released only over HTTPS to an agent with an administrator-assigned repository.
const router = Router();
type Operation = ManagedOperation;
type Agent = {
  id: string; name: string; token_hash: string; created_at: string;
  last_seen: string | null; disabled: number; schedule_minutes: number; next_run_at: string | null;
  capabilities?: string;
  repository_job_id?: string|null; repository_name?: string|null; storage_name?: string|null;
};
type AgentJob = {
  id: string; client_id: string; operation: Operation;
  state: 'pending' | 'running' | 'success' | 'failed'; created_at: string;
  started_at: string | null; finished_at: string | null; lease_until: string | null;
  message: string | null; request_json?:string|null; result_json?:string|null; has_result?:number;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const agentSelect=`SELECT m.*,r.job_id AS repository_job_id,j.name AS repository_name,l.name AS storage_name
  FROM managed_clients m LEFT JOIN managed_repositories r ON r.client_id=m.id
  LEFT JOIN jobs j ON j.id=r.job_id LEFT JOIN locations l ON l.id=j.destination_id`;
const lookup = (id: unknown) => typeof id === 'string' && uuid.test(id)
  ? getOne<Agent>(agentSelect+' WHERE m.id=?', [id]) : Promise.resolve(null);
const publicAgent = ({ token_hash: _secret, ...safe }: Agent) => ({
  id: safe.id, name: safe.name, createdAt: safe.created_at,
  lastSeen: safe.last_seen, disabled: !!safe.disabled,
  scheduleMinutes: safe.schedule_minutes, nextRunAt: safe.next_run_at,
  capabilities:JSON.parse(safe.capabilities||'[]'),
  repositoryJobId:safe.repository_job_id||null,repositoryName:safe.repository_name||null,storageName:safe.storage_name||null
});
const publicJob = (j: AgentJob) => ({
  id: j.id, operation: j.operation, state: j.state,
  createdAt: j.created_at, startedAt: j.started_at,
  finishedAt: j.finished_at, message: j.message, hasResult:!!(j.result_json||j.has_result)
});
const isConflict = (e: unknown) =>
  /unique|constraint|duplicate key/i.test(e instanceof Error ? e.message : String(e));
async function agentAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.get('x-fortress-agent-id');
    const bearer = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(req.get('authorization') ?? '')?.[1];
    if (!id || !bearer) return res.status(401).json({ error: 'Agent authentication required' });
    const agent = await lookup(id);
    if (!agent || agent.disabled) return res.status(401).json({ error: 'Invalid agent identity' });
    const a = Buffer.from(sha256(bearer), 'hex');
    const b = Buffer.from(agent.token_hash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
      return res.status(401).json({ error: 'Invalid agent credentials' });
    (req as any).managedAgent = agent.id;
    next();
  } catch (e) { next(e); }
}

// Enrollment secrets are issued once and never returned by inventory endpoints.
router.post('/admin/enroll', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const name = req.body?.name;
    if (typeof name !== 'string' || !name.trim() || name.length > 100)
      return res.status(400).json({ error: 'Invalid name' });
    let repositoryJobId=req.body?.repositoryJobId;
    if(repositoryJobId===undefined){
      const ready=await query<{id:string}>(`SELECT j.id FROM jobs j JOIN locations l ON l.id=j.destination_id
        WHERE j.tool='Restic' AND j.repo_password IS NOT NULL AND j.repo_password<>''
        AND l.type='sftp' AND l.secret_key IS NOT NULL AND l.secret_key<>'' AND l.host_public_key IS NOT NULL`);
      if(ready.length===1)repositoryJobId=ready[0].id;
    }
    if(repositoryJobId!=null){
      if(typeof repositoryJobId!=='string'||!uuid.test(repositoryJobId))return res.status(400).json({error:'Invalid repository job'});
      try{await managedRepository(repositoryJobId)}catch(e){return res.status(400).json({error:e instanceof Error?e.message:'Repository not ready'})}
    }
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('base64url');
    await run('INSERT INTO managed_clients(id,name,token_hash,created_at) VALUES(?,?,?,?)',
      [id, name.trim(), sha256(token), new Date().toISOString()]);
    if(repositoryJobId)await run('INSERT INTO managed_repositories(client_id,job_id) VALUES(?,?)',[id,repositoryJobId]);
    res.status(201).json({ id, name: name.trim(), token });
  } catch (e) { next(e); }
});

router.get('/admin', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const limit=Number(req.query.limit??50), offset=Number(req.query.offset??0);
    if (!Number.isSafeInteger(limit)||limit<1||limit>100||
        !Number.isSafeInteger(offset)||offset<0||offset>1000000)
      return res.status(400).json({error:'Invalid pagination'});
    const agents=await query<Agent>(agentSelect+' ORDER BY m.created_at DESC LIMIT ? OFFSET ?',[limit,offset]);
    const recent=await query<AgentJob>(`
      SELECT id,client_id,operation,state,created_at,started_at,finished_at,lease_until,message,CASE WHEN result_json IS NOT NULL THEN 1 ELSE 0 END AS has_result
      FROM (
        SELECT *,ROW_NUMBER() OVER(PARTITION BY client_id ORDER BY CASE WHEN state IN ('pending','running') THEN 0 ELSE 1 END,created_at DESC) AS rn
        FROM managed_jobs WHERE client_id IN (
          SELECT id FROM managed_clients ORDER BY created_at DESC LIMIT ? OFFSET ?
        )
      ) AS j WHERE rn<=8 ORDER BY created_at DESC`,[limit,offset]);
    const grouped=new Map<string,ReturnType<typeof publicJob>[]>();
    for(const j of recent){
      if(!grouped.has(j.client_id))grouped.set(j.client_id,[]);
      grouped.get(j.client_id)!.push(publicJob(j));
    }
    res.json(agents.map(a=>({...publicAgent(a),jobs:grouped.get(a.id)??[]})));
  }catch(e){next(e);}
});

router.get('/admin/activity',authenticateToken,requireAdmin,async(_req,res,next)=>{
 try{res.json(await query(`SELECT j.operation,COUNT(*) AS count FROM managed_jobs j JOIN managed_clients c ON c.id=j.client_id WHERE j.state='running' GROUP BY j.operation`))}catch(error){next(error)}
});

router.get('/admin/:id', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const agent = await lookup(req.params.id);
    if (!agent) return res.sendStatus(404);
    const jobs = await query<AgentJob>(
      'SELECT * FROM managed_jobs WHERE client_id=? ORDER BY created_at DESC LIMIT 50', [agent.id]);
    res.json({ ...publicAgent(agent), jobs: jobs.map(publicJob) });
  } catch (e) { next(e); }
});

router.put('/admin/:id/repository',authenticateToken,requireAdmin,async(req,res,next)=>{
  try{
    const agent=await lookup(req.params.id);
    if(!agent)return res.sendStatus(404);
    if(agent.disabled)return res.status(409).json({error:'Client disabled'});
    const jobId=req.body?.repositoryJobId;
    if(typeof jobId!=='string'||!uuid.test(jobId))return res.status(400).json({error:'Invalid repository job'});
    try{await managedRepository(jobId)}catch(e){return res.status(400).json({error:e instanceof Error?e.message:'Repository not ready'})}
    await run(`INSERT INTO managed_repositories(client_id,job_id) VALUES(?,?)
      ON CONFLICT(client_id) DO UPDATE SET job_id=excluded.job_id`,[agent.id,jobId]);
    res.json(publicAgent((await lookup(agent.id))!));
  }catch(e){next(e)}
});

router.post('/setup',async(req,res,next)=>{
  res.set('Cache-Control','no-store');res.set('Pragma','no-cache');
  if(!req.secure)return res.status(400).json({error:'HTTPS is required to download repository credentials'});
  next();
},agentAuth,async(req,res,next)=>{
  try{
    const agent=await lookup((req as any).managedAgent);
    if(!agent?.repository_job_id)return res.status(409).json({error:'Choose a saved repository for this laptop in Managed Clients first'});
    const profile=await managedRepository(agent.repository_job_id);
    res.json(profile);
  }catch(e){next(e)}
});

async function enqueue(agent:Agent,body:any){
 const operation=body?.operation;
 if(!['backup','check','snapshots','files','restore'].includes(operation))return {status:400,body:{error:'Unsupported operation'}};
 if((operation==='files'||operation==='restore')&&!JSON.parse(agent.capabilities||'[]').includes(recoveryCapability)){
  return {status:409,body:{error:'Update the Windows agent: open the installed app and Save and connect first.'}};
 }
 let request:ManagedRequest;
 try{request=managedRequest(operation,body?.request??{})}catch(error){return {status:400,body:{error:error instanceof Error?error.message:'Invalid operation'}}}
 const job={id:crypto.randomUUID(),operation,createdAt:new Date().toISOString()};
 try{
  await run(`INSERT INTO managed_jobs(id,client_id,operation,state,created_at,request_json) VALUES(?,?,?,'pending',?,?)`,[job.id,agent.id,operation,job.createdAt,JSON.stringify(request)]);
 }catch(error){if(isConflict(error))return {status:409,body:{error:'Client already has an active job'}};throw error}
 return {status:201,body:{...job,state:'pending'}};
}
async function resultFor(clientId:string,id:unknown){
 if(typeof id!=='string'||!uuid.test(id))return null;
 const job=await getOne<AgentJob>('SELECT * FROM managed_jobs WHERE id=? AND client_id=?',[id,clientId]);
 return job?{...publicJob(job),request:job.request_json?JSON.parse(job.request_json):null,result:job.result_json?JSON.parse(job.result_json):null}:null;
}
router.post('/admin/:id/jobs',authenticateToken,requireAdmin,async(req,res,next)=>{
 try{
  const agent=await lookup(req.params.id);
  if(!agent)return res.sendStatus(404);
  if(agent.disabled)return res.status(409).json({error:'Client disabled'});
  const response=await enqueue(agent,req.body)
  res.status(response.status).json(response.body);
 }catch(error){next(error)}
});
router.get('/admin/:id/jobs/:jobId',authenticateToken,requireAdmin,async(req,res,next)=>{
 try{const result=await resultFor(req.params.id,req.params.jobId);res.set('Cache-Control','no-store');if(!result)return res.sendStatus(404);res.json(result)}catch(error){next(error)}
});
// The installed app may request only fixed operations for its own identity.
router.post('/request',agentAuth,async(req,res,next)=>{
 try{
  const agent=await lookup((req as any).managedAgent);
  if(!agent)return res.sendStatus(401);
  const response=await enqueue(agent,req.body)
  res.status(response.status).json(response.body);
 }catch(error){next(error)}
});
router.post('/result',agentAuth,async(req,res,next)=>{
 try{const result=await resultFor((req as any).managedAgent,req.body?.id);res.set('Cache-Control','no-store');if(!result)return res.sendStatus(404);res.json(result)}catch(error){next(error)}
});

router.put('/admin/:id/schedule', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const agent = await lookup(req.params.id);
    if (!agent) return res.sendStatus(404);
    const minutes = req.body?.minutes;
    if (!Number.isSafeInteger(minutes) || (minutes !== 0 && (minutes < 15 || minutes > 10080)))
      return res.status(400).json({ error: 'minutes must be 0 or 15..10080' });
    const nextRunAt = minutes ? new Date(Date.now() + minutes * 60000).toISOString() : null;
    await run('UPDATE managed_clients SET schedule_minutes=?,next_run_at=? WHERE id=?',
      [minutes, nextRunAt, agent.id]);
    res.json({ scheduleMinutes: minutes, nextRunAt });
  } catch (e) { next(e); }
});

router.post('/admin/:id/disable', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const agent = await lookup(req.params.id);
    if (!agent) return res.sendStatus(404);
    await run('UPDATE managed_clients SET disabled=1 WHERE id=?', [agent.id]);
    res.json({ disabled: true });
  } catch (e) { next(e); }
});

// Installation verifies credentials without claiming a queued backup.
router.post('/heartbeat', agentAuth, async (req, res, next) => {
  try {
    await run('UPDATE managed_clients SET last_seen=? WHERE id=?',
      [new Date().toISOString(), (req as any).managedAgent]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/poll', agentAuth, async (req, res, next) => {
  try {
    const id = (req as any).managedAgent as string;
    const now = new Date().toISOString();
    if(req.body?.capabilities!==undefined){
      if(!Array.isArray(req.body.capabilities)||req.body.capabilities.length>8||!req.body.capabilities.every((value:unknown)=>value===recoveryCapability))return res.status(400).json({error:'Invalid capabilities'});
      await run('UPDATE managed_clients SET last_seen=?,capabilities=? WHERE id=?',[now,JSON.stringify([...new Set(req.body.capabilities)]),id]);
    }else await run('UPDATE managed_clients SET last_seen=? WHERE id=?', [now, id]);
    await run(`UPDATE managed_jobs SET state='failed',finished_at=?,message='Execution lease expired; verify remote state'
      WHERE client_id=? AND state='running' AND lease_until<?`, [now, id, now]);
    // A lost poll response must not strand a leased job. The Windows client
    // persists an active-run marker and refuses to execute it twice after a crash.
    const running=await getOne<{id:string;operation:Operation}>(
      "SELECT id,operation,request_json FROM managed_jobs WHERE client_id=? AND state='running' LIMIT 1",[id]);
    if(running)return res.json({job:{id:running.id,operation:running.operation,request:(running as any).request_json?JSON.parse((running as any).request_json):{}},resumed:true});
    // Atomic compare-and-claim; unique partial index enforces one active job.
    const job = await getOne<{ id: string; operation: Operation }>(`
      UPDATE managed_jobs SET state='running', started_at=?, lease_until=?
      WHERE id=(SELECT id FROM managed_jobs WHERE client_id=? AND state='pending' ORDER BY created_at LIMIT 1)
        AND state='pending'
      RETURNING id,operation,request_json`,
      [now, new Date(Date.now()+5*60*60*1000).toISOString(), id]);
    res.json({job:job?{id:job.id,operation:job.operation,request:(job as any).request_json?JSON.parse((job as any).request_json):{}}:null});
  } catch (e) { next(e); }
});

router.post('/report', agentAuth, async (req, res, next) => {
  try {
    const clientId = (req as any).managedAgent as string;
    const { id, success, message, data } = req.body ?? {};
    if (!uuid.test(id ?? '') || typeof success !== 'boolean' ||
        (message !== undefined && (typeof message !== 'string' || message.length > 1024)))
      return res.status(400).json({ error: 'Invalid report' });
    const existing=await getOne<AgentJob>('SELECT * FROM managed_jobs WHERE id=? AND client_id=?',[id,clientId]);
    if(!existing)return res.status(409).json({error:'Job is not running'});
    let result=null;
    try{if(success)result=managedResult(existing.operation,data,managedRequest(existing.operation,existing.request_json?JSON.parse(existing.request_json):{}))}catch(error){return res.status(400).json({error:error instanceof Error?error.message:'Invalid result'})}
    const row = await getOne<{ id: string }>(`
      UPDATE managed_jobs SET state=?,finished_at=?,message=?,result_json=?
      WHERE id=? AND client_id=? AND state='running' RETURNING id`,
      [success ? 'success' : 'failed', new Date().toISOString(), message ?? '', result?JSON.stringify(result):null, id, clientId]);
    if (!row) {
      // Repeated delivery after a lost acknowledgement must be safe.
      const prior = await getOne<{state: string}>(
        'SELECT state FROM managed_jobs WHERE id=? AND client_id=?', [id, clientId]);
      if (prior?.state === (success ? 'success' : 'failed'))
        return res.json({ ok: true, duplicate: true });
      return res.status(409).json({ error: 'Job is not running' });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Runs once per minute after the database is initialized.
// Partial unique index prevents duplicate scheduling across controller replicas.
export async function dispatchScheduledManagedJobs(): Promise<void> {
  const now = new Date().toISOString();
  const due = await query<Pick<Agent,'id'|'schedule_minutes'|'next_run_at'>>(`
    SELECT id,schedule_minutes,next_run_at FROM managed_clients
    WHERE disabled=0 AND schedule_minutes>0 AND next_run_at<=?`, [now]);
  for (const client of due) {
    const slot=client.next_run_at;
    if (!slot) continue;
    let inserted=false;
    try {
      // Same logical due timestamp can never be inserted twice, even if the
      // first job finished between two concurrent scheduler reads.
      await run(`INSERT INTO managed_jobs(id,client_id,operation,state,created_at,schedule_slot)
        VALUES(?,?,'backup','pending',?,?)`, [crypto.randomUUID(), client.id, now, slot]);
      inserted=true;
    } catch (e) {
      if (!isConflict(e)) throw e;
      const sameSlot = await getOne<{id:string}>(
        'SELECT id FROM managed_jobs WHERE client_id=? AND schedule_slot=?', [client.id,slot]);
      if (!sameSlot) continue; // Another active job: retry when it finishes.
    }
    // CAS prevents stale scheduler replicas from overriding a newly chosen
    // schedule, and a durable unique slot prevents repeated dispatch.
    if(inserted || slot) {
      await run('UPDATE managed_clients SET next_run_at=? WHERE id=? AND next_run_at=? AND schedule_minutes=?',
        [new Date(Date.parse(slot)+client.schedule_minutes*60000).toISOString(), client.id, slot, client.schedule_minutes]);
    }
  }
}
export default router;
