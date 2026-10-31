import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dir, '..');

function replicationFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fortress-replication-test-'));
  const bin = path.join(directory, 'bin');
  fs.mkdirSync(bin);
  const calls = path.join(directory, 'restic-calls');
  fs.writeFileSync(path.join(bin, 'restic'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${calls}'\n`, { mode: 0o755 });
  for (const name of ['source-password', 'destination-password']) {
    fs.writeFileSync(path.join(directory, name), 'dummy-password\n', { mode: 0o600 });
  }
  return { directory, bin, calls };
}

function runReplication(fixture: ReturnType<typeof replicationFixture>, lockfile: string) {
  return Bun.spawnSync({
    cmd: ['sh', path.join(root, 'scripts/restic-replicate.sh')],
    cwd: root,
    env: {
      PATH: `${fixture.bin}:${process.env.PATH}`,
      RESTIC_FROM_REPOSITORY: '/dummy/source',
      RESTIC_FROM_PASSWORD_FILE: path.join(fixture.directory, 'source-password'),
      RESTIC_TO_REPOSITORY: '/dummy/destination',
      RESTIC_TO_PASSWORD_FILE: path.join(fixture.directory, 'destination-password'),
      FORTRESS_REPLICATION_LOCK: lockfile,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

for (const file of ['docker-compose.yaml', 'docker-compose.postgres.yaml']) {
  test(`${file} publishes the plain HTTP application on loopback only`, () => {
    const compose = Bun.YAML.parse(fs.readFileSync(path.join(root, file), 'utf8')) as any;
    expect(compose.services.fortress.ports).toEqual(['127.0.0.1:9001:9001']);
  });
}

test('PostgreSQL uses an immutable image identity', () => {
  const compose = Bun.YAML.parse(
    fs.readFileSync(path.join(root, 'docker-compose.postgres.yaml'), 'utf8'),
  ) as any;
  expect(compose.services.postgres.image).toMatch(/^postgres:16-alpine@sha256:[a-f0-9]{64}$/);
});

test('every container build stage uses a verified immutable base image identity', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const bases = [...dockerfile.matchAll(/^FROM\s+(\S+)/gm)].map((match) => match[1]);
  expect(bases).toHaveLength(2);
  for (const base of bases) {
    expect(base).toMatch(/^oven\/bun:1\.4\.4-alpine@sha256:[a-f0-9]{64}$/);
  }
});

test('Alpine packages without verified content identities are documented as unresolved', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const packages = ['borgbackup', 'restic', 'rclone', 'openssh-client', 'wget', 'tzdata', 'su-exec'];
  expect(dockerfile).toContain(`# Unresolved immutable Alpine package inputs: ${packages.join(', ')}.`);
  expect(dockerfile).toContain(
    '# No repository snapshot or package-content digests are verified; version labels alone are not immutable identities.',
  );
  const apk = dockerfile.match(/RUN apk add --no-cache \\\n([\s\S]*?)&& rm -rf/);
  expect(apk).not.toBeNull();
  const installed = [...apk![1].matchAll(/^\s{4}([a-z0-9-]+)\s*\\?$/gm)].map((match) => match[1]);
  expect(installed).toEqual(packages);
});

test('the standalone landing page has no runtime script dependency', () => {
  const html = fs.readFileSync(path.join(root, 'landing/index.html'), 'utf8');
  expect(html).not.toMatch(/<script\b/i);
});

test('the standalone landing page has no empty Lucide placeholders', () => {
  const html = fs.readFileSync(path.join(root, 'landing/index.html'), 'utf8');
  const emptyPlaceholders = html.match(/<([a-z][^>\s]*)\b[^>]*\bdata-lucide\b[^>]*>\s*<\/\1>/gi) ?? [];
  expect(emptyPlaceholders).toEqual([]);
});

test('replication refuses a shared lock directory without truncating its lockfile', () => {
  const fixture = replicationFixture();
  try {
    const lockDirectory = path.join(fixture.directory, 'shared');
    const lockfile = path.join(lockDirectory, 'replication.lock');
    fs.mkdirSync(lockDirectory, { mode: 0o777 });
    fs.writeFileSync(lockfile, 'preserve-existing-lock\n', { mode: 0o600 });

    const result = runReplication(fixture, lockfile);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain('lock directory must be private');
    expect(fs.readFileSync(lockfile, 'utf8')).toBe('preserve-existing-lock\n');
    expect(fs.existsSync(fixture.calls)).toBe(false);
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('replication retains an existing private lockfile while using the real lock', () => {
  const fixture = replicationFixture();
  try {
    const lockDirectory = path.join(fixture.directory, 'private');
    const lockfile = path.join(lockDirectory, 'replication.lock');
    fs.mkdirSync(lockDirectory, { mode: 0o700 });
    fs.writeFileSync(lockfile, 'preserve-existing-lock\n', { mode: 0o600 });

    const result = runReplication(fixture, lockfile);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString()).toBe('');
    expect(fs.readFileSync(lockfile, 'utf8')).toBe('preserve-existing-lock\n');
    expect(fs.statSync(lockfile).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(fixture.calls, 'utf8').trim().split('\n')).toHaveLength(4);
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});
