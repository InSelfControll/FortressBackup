import { afterEach, expect, test } from 'bun:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';
import { buildResticCommand } from '../server/services/backup/restic.js';
import { buildRsyncCommand, hostKeyEntry, trustFileSetup } from '../server/services/backup/rsync.js';
import { buildJobExecutionContext } from '../server/services/backup/jobContext.js';
import { mountSshfs } from '../server/services/backup/operations.js';
import { initDatabase, closeDatabase } from '../server/db/connection.js';
import { run } from '../server/db/helpers.js';
import locations from '../server/routes/locations.js';
import systems from '../server/routes/systems.js';

const HOST_PUBLIC_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINb3o4m8E7d1+Nh4V2m3zF6nY7sR4r7yYh6m4fK3M2bV';
const OTHER_PUBLIC_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const HOST_FINGERPRINT = 'SHA256:' + crypto.createHash('sha256')
    .update(Buffer.from(HOST_PUBLIC_KEY.split(' ')[1], 'base64')).digest('base64').replace(/=+$/, '');
const tempDirs: string[] = [];

const makeTempDir = (prefix: string): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
};

const fakeCapture = (): string => `
import fs from 'node:fs';
import path from 'node:path';
const entries = fs.readdirSync(process.env.TMPDIR).filter(name => name.startsWith('fortress-peer.'));
if (entries.length !== 1) throw new Error('Expected one generated trust directory');
const trustDir = path.join(process.env.TMPDIR, entries[0]);
const trustFile = path.join(trustDir, 'known_hosts');
const args = process.argv.slice(2);
const nestedCommand = process.env.FAKE_TOOL === 'restic'
    ? args[args.indexOf('-o') + 1].slice('sftp.command='.length)
    : args[args.indexOf('-e') + 1];
const [executable, ...sshArgs] = nestedCommand.split(' ').map(argument => argument.replaceAll('"', ''));
const identityFile = process.env.FAKE_TOOL === 'restic' ? sshArgs[sshArgs.indexOf('-i') + 1] : undefined;
const ssh = Bun.spawn({
    cmd: [path.join(process.env.FAKE_BIN, executable), ...sshArgs],
    stdout: 'pipe', stderr: 'pipe'
});
const [sshStdout, sshStderr, sshCode] = await Promise.all([
    new Response(ssh.stdout).text(), new Response(ssh.stderr).text(), ssh.exited
]);
if (sshCode !== 0 || sshStdout || sshStderr) throw new Error('Dummy SSH invocation failed');
fs.writeFileSync(process.env.FAKE_CAPTURE, JSON.stringify({
    args,
    sshArgs: JSON.parse(fs.readFileSync(process.env.FAKE_SSH_CAPTURE, 'utf8')),
    trustFile,
    directoryMode: (fs.statSync(trustDir).mode & 0o777).toString(8),
    fileMode: (fs.statSync(trustFile).mode & 0o777).toString(8),
    hostKey: fs.readFileSync(trustFile, 'utf8'),
    identityMode: identityFile ? (fs.statSync(identityFile).mode & 0o777).toString(8) : undefined,
    privateKey: identityFile ? fs.readFileSync(identityFile, 'utf8') : undefined
}));
`;

const runWithFakeTool = async (tool: 'restic' | 'rsync', command: string) => {
    const dir = makeTempDir(`fortress-${tool}-peer-`);
    const bin = path.join(dir, 'bin');
    const tmp = path.join(dir, 'tmp');
    const capture = path.join(dir, 'capture.json');
    const sshCapture = path.join(dir, 'ssh-capture.json');
    fs.mkdirSync(bin); fs.mkdirSync(tmp);
    fs.writeFileSync(path.join(bin, tool), '#!/usr/bin/env bun\n' + fakeCapture(), { mode: 0o755 });
    fs.writeFileSync(path.join(bin, 'ssh'), `#!/usr/bin/env bun
import fs from 'node:fs';
fs.writeFileSync(process.env.FAKE_SSH_CAPTURE, JSON.stringify(process.argv.slice(2)));
`, { mode: 0o755 });
    const child = Bun.spawn({
        cmd: ['/bin/sh', '-s'],
        stdin: new Blob([command]),
        stdout: 'pipe', stderr: 'pipe',
        env: {
            ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp,
            FAKE_TOOL: tool, FAKE_BIN: bin, FAKE_CAPTURE: capture, FAKE_SSH_CAPTURE: sshCapture
        }
    });
    const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited
    ]);
    expect({ code, stdout, stderr }).toEqual({ code: 0, stdout: '', stderr: '' });
    const observed = JSON.parse(fs.readFileSync(capture, 'utf8'));
    expect(fs.readdirSync(tmp)).toEqual([]);
    return observed;
};

afterEach(async () => {
    await closeDatabase();
    while (tempDirs.length) fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

test('Restic SFTP refuses to build without an enrolled host public key', () => {
    const config: any = {
        tool: 'restic', destinationType: 'sftp', destinationPath: 'backup@storage.example:/srv/repo',
        sourcePaths: ['/home/docs'], repoPassword: 'dummy-repository-password', jobName: 'dummy'
    };
    expect(() => buildResticCommand(config)).toThrow('host public key');
});

test('Restic SFTP rejects password-only authentication before starting SSH', () => {
    const config: any = {
        tool: 'restic', destinationType: 'sftp', destinationPath: 'backup@storage.example:/srv/repo',
        destinationHostPublicKey: HOST_PUBLIC_KEY, destinationSecretKey: 'dummy-password',
        sourcePaths: ['/home/docs'], repoPassword: 'dummy-repository-password', jobName: 'dummy'
    };
    expect(() => buildResticCommand(config)).toThrow('Restic SFTP requires an SSH private key; password-only authentication is not supported');
});

test('local Rsync refuses a syntax-only fingerprint without an enrolled host public key', () => {
    const config: any = {
        tool: 'rsync', destinationType: 'nfs', destinationPath: '/tmp/restore',
        sourcePaths: ['/home/docs'], jobName: 'dummy'
    };
    const ssh: any = { username: 'backup', host: 'source.example', port: 22, hostFingerprint: HOST_FINGERPRINT };
    expect(() => buildRsyncCommand(config, ssh, true)).toThrow('host public key');
});

test('Restic SFTP uses enrolled host and client keys from owner-only files', async () => {
    const privateKey = '-----BEGIN OPENSSH PRIVATE KEY-----\ndummy-private-key-material\n-----END OPENSSH PRIVATE KEY-----\n';
    const command = buildResticCommand({
        tool: 'restic', destinationType: 'sftp', destinationPath: 'backup@storage.example:/srv/repo',
        destinationHostPublicKey: HOST_PUBLIC_KEY, destinationSecretKey: privateKey, sourcePaths: ['/home/docs'],
        repoPassword: 'dummy-repository-password', jobName: 'dummy'
    } as any);
    const observed = await runWithFakeTool('restic', command);
    expect(observed.directoryMode).toBe('700');
    expect(observed.fileMode).toBe('600');
    expect(observed.hostKey).toBe(`${HOST_PUBLIC_KEY.replace(/^ssh-ed25519 /, 'storage.example ssh-ed25519 ')}\n`);
    expect(observed.hostKey).not.toContain(OTHER_PUBLIC_KEY);
    expect(observed.identityMode).toBe('600');
    expect(observed.privateKey).toBe(privateKey);
    const args = observed.args.join(' ');
    expect(args).toContain('sftp.command=ssh backup@storage.example -p 22');
    expect(observed.sshArgs).toContain('backup@storage.example');
    expect(observed.sshArgs).toContain('StrictHostKeyChecking=yes');
    expect(observed.sshArgs).toContain('BatchMode=yes');
    expect(observed.sshArgs).toContain('IdentitiesOnly=yes');
    expect(observed.sshArgs).toContain('GlobalKnownHostsFile=/dev/null');
    expect(observed.sshArgs).toContain(`UserKnownHostsFile=${observed.trustFile}`);
    expect(observed.sshArgs).toContain(path.join(path.dirname(observed.trustFile), 'id_key'));
    expect(observed.sshArgs.join(' ')).not.toContain('$FORTRESS_TRUST_DIR');
    expect(command).not.toContain('/etc/fortress/known_hosts');
});

test('local Rsync uses only the enrolled source key in an owner-only generated trust file', async () => {
    const command = buildRsyncCommand({
        tool: 'rsync', destinationType: 'nfs', destinationPath: '/tmp/restore',
        sourcePaths: ['/home/docs'], jobName: 'dummy'
    } as any, {
        username: 'backup', host: 'source.example', port: 2222, hostFingerprint: HOST_FINGERPRINT,
        hostPublicKey: HOST_PUBLIC_KEY
    } as any, true).replace('%%KEYFILE%%', '/tmp/dummy-key');
    const observed = await runWithFakeTool('rsync', command);
    expect(observed.directoryMode).toBe('700');
    expect(observed.fileMode).toBe('600');
    expect(observed.hostKey).toBe(`[source.example]:2222 ${HOST_PUBLIC_KEY}\n`);
    expect(observed.hostKey).not.toContain(OTHER_PUBLIC_KEY);
    expect(observed.sshArgs).toContain('StrictHostKeyChecking=yes');
    expect(observed.sshArgs).toContain('BatchMode=yes');
    expect(observed.sshArgs).toContain('GlobalKnownHostsFile=/dev/null');
    expect(observed.sshArgs).toContain(`UserKnownHostsFile=${observed.trustFile}`);
    expect(observed.sshArgs.join(' ')).not.toContain('$FORTRESS_TRUST_DIR');
    expect(command).not.toContain('/etc/fortress/known_hosts');
});

test('SFTP location enrollment validates and persists the host public key', async () => {
    const previousJwt = process.env.JWT_SECRET;
    const previousCredentialKey = process.env.FORTRESS_CREDENTIAL_KEY;
    process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
    process.env.FORTRESS_CREDENTIAL_KEY = crypto.randomBytes(32).toString('hex');
    const dir = makeTempDir('fortress-location-peer-');
    await initDatabase({ type: 'sqlite', filePath: path.join(dir, 'db.sqlite') });
    await run('INSERT INTO users(id,email,name,role,auth_type) VALUES(?,?,?,?,?)',
        ['admin', 'admin@example.invalid', 'Admin', 'admin', 'local']);
    const app = express(); app.use(express.json()); app.use('/api/locations', locations);
    const server = app.listen(0, '127.0.0.1');
    try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Unable to bind test server');
        const base = `http://127.0.0.1:${address.port}/api/locations`;
        const token = jwt.sign({ id: 'admin', role: 'admin', authEpoch: 0 }, process.env.JWT_SECRET);
        const post = (body: unknown) => fetch(base, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        expect((await post({ name: 'Unpinned', type: 'sftp', path: 'backup@storage.example:/srv/repo' })).status).toBe(400);
        expect((await post({
            name: 'Wrong key', type: 'sftp', path: 'backup@storage.example:/srv/repo', host_public_key: 'not-a-public-key'
        })).status).toBe(400);
        const response = await post({
            name: 'Pinned', type: 'sftp', path: 'sftp://backup@storage.example:2222/srv/repo',
            access_key: 'backup', secret_key: 'dummy-password', host_public_key: HOST_PUBLIC_KEY
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            type: 'sftp', path: 'sftp://backup@storage.example:2222/srv/repo',
            hasAccessKey: true, hasSecretKey: true, host_public_key: HOST_PUBLIC_KEY
        });
        const listing = await (await fetch(base, { headers: { Authorization: `Bearer ${token}` } })).json() as any[];
        expect(listing[0].path).toBe('sftp://backup@storage.example:2222/srv/repo');
        expect(listing[0].host_public_key).toBe(HOST_PUBLIC_KEY);
    } finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
        if (previousJwt === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousJwt;
        if (previousCredentialKey === undefined) delete process.env.FORTRESS_CREDENTIAL_KEY;
        else process.env.FORTRESS_CREDENTIAL_KEY = previousCredentialKey;
    }
});

test('source system enrollment derives fingerprints and rejects wrong host key formats', async () => {
    const previousJwt = process.env.JWT_SECRET;
    process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
    const dir = makeTempDir('fortress-system-peer-');
    await initDatabase({ type: 'sqlite', filePath: path.join(dir, 'db.sqlite') });
    await run('INSERT INTO users(id,email,name,role,auth_type) VALUES(?,?,?,?,?)',
        ['admin', 'admin@example.invalid', 'Admin', 'admin', 'local']);
    const app = express(); app.use(express.json()); app.use('/api/systems', systems);
    const server = app.listen(0, '127.0.0.1');
    try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Unable to bind test server');
        const base = `http://127.0.0.1:${address.port}/api/systems`;
        const token = jwt.sign({ id: 'admin', role: 'admin', authEpoch: 0 }, process.env.JWT_SECRET);
        const post = (body: unknown) => fetch(base, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const system = {
            name: 'Source', host: 'source.example', username: 'backup', port: 22,
            type: 'remote', status: 'online', health: 100
        };
        for (const hostPublicKey of [
            'not-a-public-key',
            'ssh-ed25519 not-base64!',
            HOST_PUBLIC_KEY.replace('ssh-ed25519', 'ssh-rsa')
        ]) {
            expect((await post({ ...system, hostPublicKey })).status).toBe(400);
        }
        const response = await post({ ...system, hostPublicKey: HOST_PUBLIC_KEY });
        expect(response.status).toBe(200);
        const created = await response.json();
        expect(created).toMatchObject({
            host: 'source.example', hostPublicKey: HOST_PUBLIC_KEY, hostFingerprint: HOST_FINGERPRINT
        });
        const otherFingerprint = 'SHA256:' + crypto.createHash('sha256')
            .update(Buffer.from(OTHER_PUBLIC_KEY.split(' ')[1], 'base64')).digest('base64').replace(/=+$/, '');
        const updated = await fetch(`${base}/${created.id}`, {
            method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...created, hostPublicKey: OTHER_PUBLIC_KEY, hostFingerprint: undefined })
        });
        expect(updated.status).toBe(200);
        expect(await updated.json()).toMatchObject({
            hostPublicKey: OTHER_PUBLIC_KEY, hostFingerprint: otherFingerprint
        });
        const listing = await (await fetch(base, { headers: { Authorization: `Bearer ${token}` } })).json() as any[];
        expect(listing[0].hostPublicKey).toBe(OTHER_PUBLIC_KEY);
        expect(listing[0].hostFingerprint).toBe(otherFingerprint);
    } finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
        if (previousJwt === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousJwt;
    }
});

test('generated trust accepts the correct SSH peer and rejects a wrong host key', async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = publicKey.export({ format: 'jwk' });
    const field = (value: Buffer, mpint = false) => {
        const bytes = mpint && value[0] & 0x80 ? Buffer.concat([Buffer.alloc(1), value]) : value;
        const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length);
        return Buffer.concat([size, bytes]);
    };
    const enrolledKey = `ssh-rsa ${Buffer.concat([
        field(Buffer.from('ssh-rsa')),
        field(Buffer.from(jwk.e!, 'base64url'), true),
        field(Buffer.from(jwk.n!, 'base64url'), true)
    ]).toString('base64')}`;
    const serverSource = `
        import { Server } from 'ssh2';
        const server = new Server({ hostKeys: [process.env.DUMMY_HOST_KEY] }, client => {
            client.on('authentication', context => context.accept());
            client.on('session', accept => {
                const session = accept();
                session.on('exec', accept => {
                    const stream = accept();
                    stream.exit(0);
                    stream.end();
                });
            });
        });
        server.on('error', () => {});
        server.listen(0, '127.0.0.1', () => console.log(server.address().port));
    `;
    const server = Bun.spawn({
        cmd: ['bun', '-e', serverSource], stdout: 'pipe', stderr: 'ignore',
        env: { ...process.env, DUMMY_HOST_KEY: privateKey.export({ type: 'pkcs1', format: 'pem' }) as string }
    });
    const reader = server.stdout.getReader();
    const announcement = await reader.read();
    reader.releaseLock();
    if (!announcement.value) throw new Error('Unable to start dummy SSH server');
    const port = Number(new TextDecoder().decode(announcement.value).trim());
    if (!Number.isInteger(port) || port < 1) throw new Error('Unable to bind dummy SSH server');
    const execute = async (command: string) => {
        const child = Bun.spawn({
            cmd: ['/bin/sh', '-s'], stdin: new Blob([command]), stdout: 'pipe', stderr: 'pipe'
        });
        const [stdout, stderr, code] = await Promise.all([
            new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited
        ]);
        return { stdout, stderr, code };
    };
    const ssh = `ssh -T -o ConnectTimeout=5 -o BatchMode=yes -o StrictHostKeyChecking=yes -o GlobalKnownHostsFile=/dev/null -o UserKnownHostsFile="$FORTRESS_TRUST_DIR/known_hosts" -p ${port} backup@127.0.0.1 exit`;
    try {
        const correct = await execute(trustFileSetup(hostKeyEntry('127.0.0.1', port, enrolledKey)) + ssh);
        expect(correct.code).toBe(0);
        expect(correct.stderr).not.toContain('Host key verification failed');
        const wrong = await execute(trustFileSetup(hostKeyEntry('127.0.0.1', port, OTHER_PUBLIC_KEY)) + ssh);
        expect(wrong.code).not.toBe(0);
        expect(wrong.stderr).toContain('Host key verification failed');
    } finally {
        server.kill();
        await server.exited;
    }
}, 20000);

test('job context keeps the local Rsync source key distinct from the Restic SFTP destination key', async () => {
    const dir = makeTempDir('fortress-job-peer-');
    await initDatabase({ type: 'sqlite', filePath: path.join(dir, 'db.sqlite') });
    await run(`INSERT INTO systems(id,name,host,username,port,type,status,health,host_fingerprint,host_public_key)
        VALUES(?,?,?,?,?,?,?,?,?,?)`, ['source', 'Source', 'source.example', 'backup', 22, 'remote', 'online', 100, HOST_FINGERPRINT, HOST_PUBLIC_KEY]);
    await run(`INSERT INTO locations(id,name,type,path,host_public_key) VALUES(?,?,?,?,?)`,
        ['destination', 'Pinned peer', 'sftp', 'backup@storage.example:/srv/repo', OTHER_PUBLIC_KEY]);
    await run(`INSERT INTO jobs(id,name,tool,source_id,destination_id,source_path,priority,status)
        VALUES(?,?,?,?,?,?,?,?)`, ['job', 'Dummy', 'Rsync', 'source', 'destination', '["/home/docs"]', 'Medium', 'Idle']);
    const context = await buildJobExecutionContext({
        id: 'job', name: 'Dummy', tool: 'Rsync', source_id: 'source', destination_id: 'destination',
        source_path: '["/home/docs"]', priority: 'Medium', status: 'Idle'
    }, { privateKey: 'dummy-private-key' });
    expect(context.sshConfig.hostPublicKey).toBe(HOST_PUBLIC_KEY);
    expect(context.jobConfig.destinationHostPublicKey).toBe(OTHER_PUBLIC_KEY);
});

test('Borg SSHFS normalizes the UI SFTP URL and preserves its port', async () => {
    const commands: string[] = [];
    const executor: any = {
        log: () => {},
        exec: async (command: string) => {
            commands.push(command);
            return { stdout: '', stderr: '', code: 0 };
        }
    };
    const mountPoint = await mountSshfs(executor, {
        jobId: '11111111-1111-1111-1111-111111111111',
        destinationPath: 'sftp://backup@storage.example:2222/srv/repo'
    } as any);

    expect(mountPoint).toBe('/tmp/fortress_mnt_11111111-1111-1111-1111-111111111111');
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain('sshfs -p 2222 ');
    expect(commands[0]).toContain("'backup@storage.example:/srv/repo'");
    expect(commands[0]).not.toContain('sftp://');
});
