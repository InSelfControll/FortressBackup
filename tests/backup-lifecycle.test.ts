import { test, expect, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, initDatabase } from '../server/db/connection.js';
import { getOne, run } from '../server/db/helpers.js';
import jobs from '../server/routes/jobs.js';
import { decrypt } from '../server/encryption.js';
import { BackupExecutor } from '../server/services/backup/core.js';
import { listFiles, listSnapshots, restore } from '../server/services/backup/operations.js';

const dummyConfig: any = {
    jobId: '11111111-1111-1111-1111-111111111111',
    jobName: 'dummy-backup',
    tool: 'restic',
    sourcePaths: ['/home/dummy'],
    destinationType: 'nfs',
    destinationPath: '/tmp/dummy-repository',
    repoPassword: 'dummy-repository-password',
    snapshotId: 'abcdef12',
    restorePath: '/tmp/dummy-restore'
};

const runLeaseSql = `UPDATE jobs SET status='Running',run_epoch=COALESCE(run_epoch,0)+1
    WHERE id=? AND COALESCE(status,'Idle')!='Running' RETURNING id`;

const insertJob = async (id: string, status = 'Idle') => {
    await run(`INSERT INTO jobs(id,name,tool,source_id,destination_id,source_path,priority,status,schedule)
        VALUES(?,?,?,?,?,?,?,?,?)`,
        [id, 'Original name', 'Restic', 'source', 'destination', '["/home/dummy"]', 'Medium', status, 'original-schedule']);
};

const interleaveRunStartAfterJobRead = (jobId: string) => {
    const originalPrepare = Database.prototype.prepare;
    let interleaved = false;
    const prepare = spyOn(Database.prototype, 'prepare').mockImplementation(function (sql: string) {
        const statement = originalPrepare.call(this, sql);
        if (!interleaved && sql === 'SELECT * FROM jobs WHERE id = ?') {
            interleaved = true;
            const originalAll = statement.all.bind(statement);
            statement.all = ((...params: any[]) => {
                const rows = originalAll(...params);
                const leased = originalPrepare.call(this, runLeaseSql).get(jobId);
                if (!leased) throw new Error('Dummy run failed to start');
                return rows;
            }) as any;
        }
        return statement;
    });
    return () => {
        prepare.mockRestore();
        expect(interleaved).toBe(true);
    };
};

const startJobApi = async () => {
    process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fortress-backup-api-'));
    await initDatabase({ type: 'sqlite', filePath: path.join(dir, 'db.sqlite') });
    await run('INSERT INTO users(id,email,name,role,auth_type) VALUES(?,?,?,?,?)',
        ['admin', 'admin@example.invalid', 'Admin', 'admin', 'local']);
    const app = express();
    app.use(express.json());
    app.use('/api/jobs', jobs);
    const server = app.listen(0, '127.0.0.1');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Unable to bind test server');
    return {
        dir,
        server,
        base: `http://127.0.0.1:${address.port}/api/jobs`,
        token: jwt.sign({ id: 'admin', role: 'admin', authEpoch: 0 }, process.env.JWT_SECRET)
    };
};

const stopJobApi = async (fixture: Awaited<ReturnType<typeof startJobApi>>) => {
    await new Promise<void>(resolve => fixture.server.close(() => resolve()));
    await closeDatabase();
    fs.rmSync(fixture.dir, { recursive: true, force: true });
};

test('restore forwards selected paths to Borg and Restic', async () => {
    const commands: string[] = [];
    const executor: any = {
        getLogs: () => [],
        log: () => {},
        exec: async (command: string) => {
            commands.push(command);
            return { stdout: '', stderr: '', code: 0 };
        }
    };

    const selection = ['docs/report.txt'];
    const resticResult = await restore(executor, { ...dummyConfig, paths: selection });
    const borgResult = await restore(executor, {
        ...dummyConfig,
        tool: 'borg',
        snapshotId: 'dummy-archive',
        paths: selection
    });

    expect(resticResult.success).toBe(true);
    expect(borgResult.success).toBe(true);
    expect(commands[0]).toContain(" --include 'docs/report.txt'");
    expect(commands[1]).toContain(" 'docs/report.txt'");
});

test('restore rejects an explicitly empty path selection before execution', async () => {
    let executions = 0;
    const executor: any = {
        getLogs: () => [],
        log: () => {},
        exec: async () => {
            executions++;
            return { stdout: '', stderr: '', code: 0 };
        }
    };

    await expect(restore(executor, {
        ...dummyConfig,
        snapshotId: 'abcdef12',
        restorePath: '/tmp/dummy-restore',
        paths: []
    })).rejects.toThrow('Restore path selection cannot be empty');
    expect(executions).toBe(0);
});

test.skipIf(process.platform === 'win32')('local cancellation kills the complete descendant process group', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fortress-process-group-'));
    const marker = path.join(dir, 'orphan-marker');
    const executor = new BackupExecutor(true);
    await executor.connect({ host: 'localhost', port: 22, hostFingerprint: 'unused', username: 'dummy' });
    const controller = new AbortController();
    const command = `(sleep 0.25; printf orphan > ${marker}) & printf ready; wait`;
    const execution = executor.exec(command, controller.signal);
    const cancellation = setTimeout(() => controller.abort(), 50);

    try {
        await expect(execution).rejects.toThrow('Backup command aborted');
        await Bun.sleep(350);
        expect(fs.existsSync(marker)).toBe(false);
    } finally {
        clearTimeout(cancellation);
        executor.disconnect();
        await Bun.sleep(350);
        fs.rmSync(dir, { recursive: true, force: true });
    }
}, 2000);

test('snapshot and file listing propagate cancellation to command execution', async () => {
    for (const operation of ['snapshots', 'files'] as const) {
        const controller = new AbortController();
        const executor: any = {
            log: () => {},
            exec: async (_command: string, signal?: AbortSignal) => {
                if (!signal) throw new Error('missing cancellation signal');
                return new Promise((_resolve, reject) => {
                    signal.addEventListener('abort', () => reject(new Error('listing aborted')), { once: true });
                });
            }
        };
        const listing = operation === 'snapshots'
            ? listSnapshots(executor, dummyConfig, controller.signal)
            : listFiles(executor, dummyConfig, 'abcdef12', controller.signal);
        controller.abort();
        await expect(listing).rejects.toThrow('listing aborted');
    }
});

test('stale run A cannot fail newer run B after startup recovery', async () => {
    const fixture = await startJobApi();
    const deferred = () => {
        let resolve!: (value: { stdout: string; stderr: string; code: number }) => void;
        let started!: () => void;
        const startedPromise = new Promise<void>(resolveStarted => { started = resolveStarted; });
        const result = new Promise<{ stdout: string; stderr: string; code: number }>(resolveResult => {
            resolve = resolveResult;
        });
        return { result, resolve, started: startedPromise, markStarted: () => started() };
    };
    const runA = deferred();
    const runB = deferred();
    const connect = spyOn(BackupExecutor.prototype, 'connect').mockResolvedValue(true);
    const disconnect = spyOn(BackupExecutor.prototype, 'disconnect').mockImplementation(() => {});
    let executions = 0;
    const exec = spyOn(BackupExecutor.prototype, 'exec').mockImplementation(() => {
        executions++;
        const execution = executions === 1 ? runA : runB;
        execution.markStarted();
        return execution.result;
    });
    try {
        await insertJob('ownership-job');
        await run(`INSERT INTO systems(id,name,host,username,port,type,status)
            VALUES('source','Dummy source','dummy.invalid','dummy',22,'remote','online')`);
        await run(`INSERT INTO locations(id,name,type,path)
            VALUES('destination','Dummy destination','nfs','/tmp/dummy-repository')`);
        const requestRun = () => fetch(`${fixture.base}/ownership-job/run`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${fixture.token}`, 'Content-Type': 'application/json' },
            body: '{}'
        });

        const responseA = requestRun();
        await runA.started;
        const epochA = (await getOne<any>('SELECT * FROM jobs WHERE id=?', ['ownership-job'])).run_epoch;

        await run(`UPDATE jobs SET status='Failed' WHERE id=? AND run_epoch=?`, ['ownership-job', epochA]);
        const responseB = requestRun();
        await runB.started;
        const epochB = (await getOne<any>('SELECT * FROM jobs WHERE id=?', ['ownership-job'])).run_epoch;

        const events: string[] = [];
        let streamEnded = false;
        const stream: any = {
            setHeader: () => {},
            flushHeaders: () => {},
            on: () => {},
            write: (event: string) => { events.push(event); return true; },
            end: () => { streamEnded = true; }
        };
        const { subscribeToJobLogs } = await import('../server/logStreamer.js');
        subscribeToJobLogs('ownership-job', stream);

        runA.resolve({ stdout: '', stderr: 'stale failure', code: 1 });
        const statusA = (await responseA).status;
        const runningB = await getOne<any>('SELECT * FROM jobs WHERE id=?', ['ownership-job']);

        const staleCompletions = events.filter(event => event.includes('"type":"complete"'));
        const endedAfterStaleRun = streamEnded;

        runB.resolve({ stdout: '2 MB 3 files', stderr: '', code: 0 });
        const statusB = (await responseB).status;
        const finalJob = await getOne<any>('SELECT * FROM jobs WHERE id=?', ['ownership-job']);
        const completions = events.filter(event => event.includes('"type":"complete"'));

        expect(statusA).toBe(500);
        expect(statusB).toBe(200);
        expect(runningB.status).toBe('Running');
        expect(finalJob.status).toBe('Success');
        expect(epochA).toBe(1);
        expect(epochB).toBe(2);
        expect(finalJob.run_epoch).toBe(2);
        expect(finalJob.size).toBe('2.00 MB');
        expect(staleCompletions).toHaveLength(0);
        expect(endedAfterStaleRun).toBe(false);
        expect(completions).toHaveLength(1);
        expect(completions[0]).toContain('"success":true');
        expect(streamEnded).toBe(true);
    } finally {
        runA.resolve({ stdout: '', stderr: '', code: 1 });
        runB.resolve({ stdout: '', stderr: '', code: 1 });
        exec.mockRestore();
        disconnect.mockRestore();
        connect.mockRestore();
        await stopJobApi(fixture);
    }
});

test('run completion preserves concurrent edits and never resurrects a deleted job', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fortress-completion-'));
    await initDatabase({ type: 'sqlite', filePath: path.join(dir, 'db.sqlite') });
    try {
        const { completeRunningJob } = await import('../server/routes/jobs.js') as any;
        await insertJob('running-job', 'Running');
        await run(`UPDATE jobs SET name=?,schedule=?,run_epoch=1 WHERE id=?`,
            ['Concurrent edit', 'new-schedule', 'running-job']);
        await completeRunningJob('running-job', 1, 'Success', '2.00 MB');
        const completed = await getOne<any>('SELECT * FROM jobs WHERE id=?', ['running-job']);
        expect(completed.status).toBe('Success');
        expect(completed.name).toBe('Concurrent edit');
        expect(completed.schedule).toBe('new-schedule');
        expect(completed.size).toBe('2.00 MB');

        await run('DELETE FROM jobs WHERE id=?', ['running-job']);
        await completeRunningJob('running-job', 1, 'Failed');
        expect(await getOne('SELECT id FROM jobs WHERE id=?', ['running-job'])).toBeNull();
    } finally {
        await closeDatabase();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('startup recovery requires operator review and blocks work with no recorded process group', async () => {
    const fixture = await startJobApi();
    try {
        const { recoverInterruptedRuns } = await import('../server/routes/jobs.js') as any;
        await insertJob('interrupted-job', 'Running');
        await insertJob('finished-job', 'Success');
        await recoverInterruptedRuns();
        const interrupted = await getOne<any>('SELECT * FROM jobs WHERE id=?', ['interrupted-job']);
        const finished = await getOne<any>('SELECT * FROM jobs WHERE id=?', ['finished-job']);
        expect(interrupted.status).toBe('ReviewRequired');
        expect(interrupted.last_run).toBeNull();
        expect(interrupted.name).toBe('Original name');
        expect(finished.status).toBe('Success');
        expect(finished.last_run).toBeNull();

        const response = await fetch(`${fixture.base}/interrupted-job/run`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${fixture.token}`, 'Content-Type': 'application/json' },
            body: '{}'
        });
        expect(response.status).toBe(409);
        expect((await getOne<any>('SELECT status FROM jobs WHERE id=?', ['interrupted-job'])).status)
            .toBe('ReviewRequired');
    } finally {
        await stopJobApi(fixture);
    }
});

test.skipIf(process.platform === 'win32')('startup recovery stops a recorded process group before releasing its lease', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fortress-recorded-recovery-'));
    const marker = path.join(dir, 'orphan-marker');
    await initDatabase({ type: 'sqlite', filePath: path.join(dir, 'db.sqlite') });
    const executor = new BackupExecutor(true);
    await executor.connect({ host: 'localhost', port: 22, hostFingerprint: 'unused', username: 'dummy' });
    try {
        const core = await import('../server/services/backup/core.js') as any;
        const { recoverInterruptedRuns } = await import('../server/routes/jobs.js') as any;
        await insertJob('recorded-job', 'Running');
        const execution = core.withBackupProcessContext(
            { jobId: 'recorded-job', runEpoch: 0 },
            () => executor.exec(`(sleep 0.3; printf orphan > ${marker}) & printf ready; wait`)
        );

        await recoverInterruptedRuns();
        const recovered = await getOne<any>('SELECT * FROM jobs WHERE id=?', ['recorded-job']);
        expect(recovered.status).toBe('Failed');
        expect((await execution).code).not.toBe(0);
        await Bun.sleep(400);
        expect(fs.existsSync(marker)).toBe(false);
    } finally {
        executor.disconnect();
        await closeDatabase();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('job updates encrypt the snake-case repository password alias', async () => {
    const fixture = await startJobApi();
    try {
        await run("INSERT INTO systems(id,name,host,type,status,health) VALUES('source','Source','source.example.invalid','remote','offline',0)");
        await run("INSERT INTO locations(id,name,type,path) VALUES('destination','Destination','nfs','/tmp/dummy-repo')");
        await insertJob('password-job');
        const response = await fetch(`${fixture.base}/password-job`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${fixture.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Password job',
                tool: 'Restic',
                sourceId: 'source',
                destinationId: 'destination',
                sourcePaths: ['/home/dummy'],
                priority: 'Medium',
                status: 'Idle',
                repo_password: 'dummy-alias-password'
            })
        });
        expect(response.status).toBe(200);
        const stored = await getOne<any>('SELECT repo_password FROM jobs WHERE id=?', ['password-job']);
        expect(stored.repo_password).not.toContain('dummy-alias-password');
        expect(decrypt(JSON.parse(stored.repo_password), process.env.JWT_SECRET!)).toBe('dummy-alias-password');
    } finally {
        await stopJobApi(fixture);
    }
});

test('edit rejects a run that starts after its status check', async () => {
    const fixture = await startJobApi();
    await run("INSERT INTO systems(id,name,host,type,status,health) VALUES('source','Source','source.example.invalid','remote','offline',0)");
    await run("INSERT INTO locations(id,name,type,path) VALUES('destination','Destination','nfs','/tmp/dummy-repo')");
    await insertJob('edit-race-job');
    const restoreInterleaving = interleaveRunStartAfterJobRead('edit-race-job');
    try {
        const response = await fetch(`${fixture.base}/edit-race-job`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${fixture.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Racing edit',
                tool: 'Restic',
                sourceId: 'source',
                destinationId: 'destination',
                sourcePaths: ['/home/dummy'],
                priority: 'Medium',
                status: 'Idle'
            })
        });
        expect(response.status).toBe(409);
        expect(await getOne<any>('SELECT name,status FROM jobs WHERE id=?', ['edit-race-job'])).toEqual({
            name: 'Original name', status: 'Running'
        });
        expect(await getOne(runLeaseSql, ['edit-race-job'])).toBeNull();
    } finally {
        restoreInterleaving();
        await stopJobApi(fixture);
    }
});

test('delete rejects a run that starts after its status check', async () => {
    const fixture = await startJobApi();
    await insertJob('delete-race-job');
    const restoreInterleaving = interleaveRunStartAfterJobRead('delete-race-job');
    try {
        const response = await fetch(`${fixture.base}/delete-race-job`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${fixture.token}` }
        });
        expect(response.status).toBe(409);
        expect(await getOne<any>('SELECT name,status FROM jobs WHERE id=?', ['delete-race-job'])).toEqual({
            name: 'Original name', status: 'Running'
        });
        expect(await getOne(runLeaseSql, ['delete-race-job'])).toBeNull();
    } finally {
        restoreInterleaving();
        await stopJobApi(fixture);
    }
});

test('editing or deleting a job during its active run is rejected', async () => {
    const fixture = await startJobApi();
    try {
        await insertJob('active-job', 'Running');
        const body = {
            name: 'Conflicting edit',
            tool: 'Restic',
            sourceId: 'source',
            destinationId: 'destination',
            sourcePaths: ['/home/dummy'],
            priority: 'Medium',
            status: 'Idle'
        };
        const headers = { Authorization: `Bearer ${fixture.token}`, 'Content-Type': 'application/json' };
        const update = await fetch(`${fixture.base}/active-job`, {
            method: 'PUT', headers, body: JSON.stringify(body)
        });
        expect(update.status).toBe(409);
        const deletion = await fetch(`${fixture.base}/active-job`, { method: 'DELETE', headers });
        expect(deletion.status).toBe(409);
        expect((await getOne<any>('SELECT name,status FROM jobs WHERE id=?', ['active-job']))).toEqual({
            name: 'Original name', status: 'Running'
        });
    } finally {
        await stopJobApi(fixture);
    }
});

test('security headers deny framing with CSP and a legacy fallback', async () => {
    const { securityHeaders } = await import('../server/middleware/securityHeaders.js');
    const app = express();
    app.use(securityHeaders);
    app.get('/dummy', (_req, res) => res.json({ ok: true }));
    const server = app.listen(0, '127.0.0.1');
    try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Unable to bind test server');
        const response = await fetch(`http://127.0.0.1:${address.port}/dummy`);
        expect(response.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
        expect(response.headers.get('x-frame-options')).toBe('DENY');
    } finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});
