import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import { getOne, query, run } from '../db/helpers.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

// No storage credentials, source paths or remote commands are accepted here.
const router = Router();
type Operation = 'backup' | 'check' | 'snapshots';
type Agent = {
  id: string; name: string; token_hash: string; created_at: string;
  last_seen: string | null; disabled: number; schedule_minutes: number; next_run_at: string | null;
};
type AgentJob = {
  id: string; client_id: string; operation: Operation;
  state: 'pending' | 'running' | 'success' | 'failed'; created_at: string;
  started_at: string | null; finished_at: string | null; lease_until: string | null;
  message: string | null;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const lookup = (id: unknown) => typeof id === 'string' && uuid.test(id)
  ? getOne<Agent>('SELECT * FROM managed_clients WHERE id=?', [id]) : Promise.resolve(null);
const publicAgent = ({ token_hash: _secret, ...safe }: Agent) => ({
  id: safe.id, name: safe.name, createdAt: safe.created_at,
  lastSeen: safe.last_seen, disabled: !!safe.disabled,
  scheduleMinutes: safe.schedule_minutes, nextRunAt: safe.next_run_at
});
const publicJob = (j: AgentJob) => ({
  id: j.id, operation: j.operation, state: j.state,
  createdAt: j.created_at, startedAt: j.started_at,
  finishedAt: j.finished_at, message: j.message
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
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('base64url');
    await run('INSERT INTO managed_clients(id,name,token_hash,created_at) VALUES(?,?,?,?)',
      [id, name.trim(), sha256(token), new Date().toISOString()]);
    res.status(201).json({ id, name: name.trim(), token });
  } catch (e) { next(e); }
});

router.get('/admin', authenticateToken, requireAdmin, async (_req, res, next) => {
  try {
    const agents = await query<Agent>('SELECT * FROM managed_clients ORDER BY created_at DESC');
    const recent = await query<AgentJob>(
      `SELECT id,client_id,operation,state,created_at,started_at,finished_at,lease_until,message
       FROM (SELECT *, ROW_NUMBER() OVER(PARTITION BY client_id ORDER BY created_at DESC) AS rn FROM managed_jobs) AS j
       WHERE rn<=8 ORDER BY created_at DESC`);
    const grouped = new Map<string, ReturnType<typeof publicJob>[]>();
    for (const j of recent) {
      if (!grouped.has(j.client_id)) grouped.set(j.client_id, []);
      grouped.get(j.client_id)!.push(publicJob(j));
    }
    res.json(agents.map(a => ({ ...publicAgent(a), jobs: grouped.get(a.id) ?? [] })));
  } catch (e) { next(e); }
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

router.post('/admin/:id/jobs', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const agent = await lookup(req.params.id);
    if (!agent) return res.sendStatus(404);
    if (agent.disabled) return res.status(409).json({ error: 'Client disabled' });
    const operation = req.body?.operation;
    if (!['backup', 'check', 'snapshots'].includes(operation))
      return res.status(400).json({ error: 'Unsupported operation' });
    const job = { id: crypto.randomUUID(), operation, createdAt: new Date().toISOString() };
    try {
      await run(`INSERT INTO managed_jobs(id,client_id,operation,state,created_at)
        VALUES(?,?,?,'pending',?)`, [job.id, agent.id, operation, job.createdAt]);
    } catch (e) {
      if (isConflict(e)) return res.status(409).json({ error: 'Client already has an active job' });
      throw e;
    }
    res.status(201).json({ ...job, state: 'pending' });
  } catch (e) { next(e); }
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

router.post('/poll', agentAuth, async (req, res, next) => {
  try {
    const id = (req as any).managedAgent as string;
    const now = new Date().toISOString();
    await run('UPDATE managed_clients SET last_seen=? WHERE id=?', [now, id]);
    await run(`UPDATE managed_jobs SET state='failed',finished_at=?,message='Execution lease expired; verify remote state'
      WHERE client_id=? AND state='running' AND lease_until<?`, [now, id, now]);
    // Atomic compare-and-claim; unique partial index enforces one active job.
    const job = await getOne<{ id: string; operation: Operation }>(`
      UPDATE managed_jobs SET state='running', started_at=?, lease_until=?
      WHERE id=(SELECT id FROM managed_jobs WHERE client_id=? AND state='pending' ORDER BY created_at LIMIT 1)
        AND state='pending'
      RETURNING id,operation`,
      [now, new Date(Date.now()+6*60*60*1000).toISOString(), id]);
    res.json({ job: job ?? null });
  } catch (e) { next(e); }
});

router.post('/report', agentAuth, async (req, res, next) => {
  try {
    const clientId = (req as any).managedAgent as string;
    const { id, success, message } = req.body ?? {};
    if (!uuid.test(id ?? '') || typeof success !== 'boolean' ||
        (message !== undefined && (typeof message !== 'string' || message.length > 1024)))
      return res.status(400).json({ error: 'Invalid report' });
    const row = await getOne<{ id: string }>(`
      UPDATE managed_jobs SET state=?,finished_at=?,message=?
      WHERE id=? AND client_id=? AND state='running' RETURNING id`,
      [success ? 'success' : 'failed', new Date().toISOString(), message ?? '', id, clientId]);
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
  const due = await query<Pick<Agent,'id'|'schedule_minutes'>>(`
    SELECT id,schedule_minutes FROM managed_clients
    WHERE disabled=0 AND schedule_minutes>0 AND next_run_at<=?`, [now]);
  for (const client of due) {
    try {
      await run(`INSERT INTO managed_jobs(id,client_id,operation,state,created_at)
        VALUES(?,?,'backup','pending',?)`, [crypto.randomUUID(), client.id, now]);
    } catch (e) {
      if (isConflict(e)) continue;
      throw e;
    }
    // A second scheduler replica may advance the same timestamp;
    // the active-job index prevents duplicate jobs.
    await run('UPDATE managed_clients SET next_run_at=? WHERE id=?',
      [new Date(Date.now()+client.schedule_minutes*60000).toISOString(), client.id]);
  }
}
export default router;
