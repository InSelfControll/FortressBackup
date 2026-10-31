import { expect, test } from 'bun:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { closeDatabase, initDatabase } from '../server/db/connection.js';
import { run } from '../server/db/helpers.js';

const projectRoot = path.resolve(import.meta.dir, '..');
const hostPublicKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINb3o4m8E7d1+Nh4V2m3zF6nY7sR4r7yYh6m4fK3M2bV';

const availablePort = async () => {
    const listener = net.createServer();
    await new Promise<void>((resolve, reject) => {
        listener.once('error', reject);
        listener.listen(0, '127.0.0.1', () => resolve());
    });
    const address = listener.address();
    if (!address || typeof address === 'string') throw new Error('Unable to allocate a test port');
    const port = address.port;
    await new Promise<void>(resolve => listener.close(() => resolve()));
    return port;
};

const waitFor = async (check: () => Promise<boolean>, description: string) => {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
        if (await check()) return;
        await Bun.sleep(25);
    }
    throw new Error(`Timed out waiting for ${description}`);
};

const startController = async (trustProxy?: string) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fortress-controller-'));
    const databasePath = path.join(directory, 'controller.sqlite');
    const jwtSecret = crypto.randomBytes(48).toString('hex');
    await initDatabase({ type: 'sqlite', filePath: databasePath });
    await run('INSERT INTO users(id,email,name,role,auth_type) VALUES(?,?,?,?,?)',
        ['admin', 'admin@example.invalid', 'Admin', 'admin', 'local']);
    await run(`INSERT INTO systems(id,name,host,username,port,type,status,host_fingerprint,host_public_key)
        VALUES(?,?,?,?,?,?,?,?,?)`, [
        'source', 'Dummy source', 'dummy.invalid', 'dummy', 22, 'remote', 'online',
        `SHA256:${crypto.randomBytes(32).toString('base64')}`, hostPublicKey
    ]);
    await run('INSERT INTO locations(id,name,type,path) VALUES(?,?,?,?)',
        ['destination', 'Dummy destination', 'nfs', path.join(directory, 'destination')]);
    await run(`INSERT INTO jobs(id,name,tool,source_id,destination_id,source_path,priority,status)
        VALUES(?,?,?,?,?,?,?,?)`, [
        'shutdown-job', 'Dummy shutdown job', 'Rsync', 'source', 'destination',
        JSON.stringify(['/home/dummy']), 'Medium', 'Idle'
    ]);
    await closeDatabase();

    const dummyBin = path.join(directory, 'bin');
    fs.mkdirSync(dummyBin);
    const marker = path.join(directory, 'orphan-marker');
    const started = path.join(directory, 'backup-started');
    fs.writeFileSync(path.join(dummyBin, 'rsync'), `#!/bin/sh
printf ready > ${started}
(sleep 0.5; printf orphan > ${marker}) &
wait
`, { mode: 0o700 });

    const port = await availablePort();
    const environment: Record<string, string | undefined> = {
        ...process.env,
        DB_TYPE: 'sqlite',
        SQLITE_PATH: databasePath,
        JWT_SECRET: jwtSecret,
        FORTRESS_CREDENTIAL_KEY: crypto.randomBytes(32).toString('hex'),
        FORTRESS_ENV_PATH: path.join(directory, 'absent.env'),
        PATH: `${dummyBin}:${process.env.PATH}`,
        PORT: String(port)
    };
    if (trustProxy === undefined) delete environment.TRUST_PROXY;
    else environment.TRUST_PROXY = trustProxy;

    const processHandle = Bun.spawn(['bun', 'server/index.ts'], {
        cwd: projectRoot,
        env: environment,
        stdout: 'pipe',
        stderr: 'pipe'
    });
    try {
        await waitFor(async () => {
            if (processHandle.exitCode !== null) {
                const stderr = await new Response(processHandle.stderr).text();
                throw new Error(`Controller exited during startup: ${stderr}`);
            }
            try {
                const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
                    signal: AbortSignal.timeout(200)
                });
                return response.ok;
            } catch {
                return false;
            }
        }, 'controller startup');
    } catch (error) {
        processHandle.kill('SIGKILL');
        await processHandle.exited;
        fs.rmSync(directory, { recursive: true, force: true });
        throw error;
    }

    return {
        directory,
        jwtSecret,
        marker,
        port,
        processHandle,
        started,
        stop: async () => {
            if (processHandle.exitCode === null) processHandle.kill('SIGKILL');
            await processHandle.exited;
            fs.rmSync(directory, { recursive: true, force: true });
        }
    };
};

const login = (port: number, forwardedFor: string) => fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwardedFor },
    body: '{}'
});

test('direct connections ignore spoofed forwarding headers for login admission', async () => {
    const controller = await startController();
    try {
        for (let attempt = 0; attempt < 10; attempt++) {
            expect((await login(controller.port, `203.0.113.${attempt + 1}`)).status).toBe(400);
        }
        expect((await login(controller.port, '203.0.113.11')).status).toBe(429);
    } finally {
        await controller.stop();
    }
}, 10_000);

test('TRUST_PROXY=1 distinguishes clients behind one trusted proxy', async () => {
    const controller = await startController('1');
    try {
        for (let attempt = 0; attempt < 10; attempt++) {
            expect((await login(controller.port, '203.0.113.10')).status).toBe(400);
        }
        expect((await login(controller.port, '203.0.113.10')).status).toBe(429);
        expect((await login(controller.port, '203.0.113.11')).status).toBe(400);
    } finally {
        await controller.stop();
    }
}, 10_000);

test.skipIf(process.platform === 'win32')('SIGTERM terminates active local process groups before controller exit', async () => {
    const controller = await startController();
    const token = jwt.sign({ id: 'admin', role: 'admin', authEpoch: 0 }, controller.jwtSecret);
    try {
        const runRequest = fetch(`http://127.0.0.1:${controller.port}/api/jobs/shutdown-job/run`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ privateKey: '-----BEGIN DUMMY KEY-----\ndummy\n-----END DUMMY KEY-----' })
        }).catch(error => error);
        await waitFor(async () => fs.existsSync(controller.started), 'dummy backup startup');

        controller.processHandle.kill('SIGTERM');
        await controller.processHandle.exited;
        await runRequest;
        await Bun.sleep(700);

        expect(fs.existsSync(controller.marker)).toBe(false);
    } finally {
        await controller.stop();
    }
}, 10_000);
