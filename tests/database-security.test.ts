import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { closeDatabase, initDatabase, pgPool } from '../server/db/connection.js';
import { generateEnvFile } from '../server/utils/env.js';

const PRIVATE_TLS_ACK = 'FORTRESS_ALLOW_PRIVATE_POSTGRES_WITHOUT_TLS';
const originalEnvironment = {
  PG_SSLMODE: process.env.PG_SSLMODE,
  PRIVATE_TLS_ACK: process.env[PRIVATE_TLS_ACK],
  FORTRESS_ENV_PATH: process.env.FORTRESS_ENV_PATH,
};
const originalUmask = process.umask();
const temporaryDirectories: string[] = [];

const temporaryDirectory = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fortress-database-security-'));
  temporaryDirectories.push(directory);
  return directory;
};

const restoreEnvironment = (name: string, value: string | undefined) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

const postgresConfig = {
  type: 'postgres' as const,
  host: 'postgres.internal',
  database: 'fortress_test',
  username: 'dummy_user',
  password: 'dummy_password',
};

const mode = (filePath: string) => fs.statSync(filePath).mode & 0o777;

beforeEach(() => {
  spyOn(Pool.prototype, 'query').mockResolvedValue({ rows: [], rowCount: 0 } as never);
  spyOn(Pool.prototype, 'end').mockResolvedValue(undefined as never);
});

afterEach(async () => {
  await closeDatabase();
  restoreEnvironment('PG_SSLMODE', originalEnvironment.PG_SSLMODE);
  restoreEnvironment(PRIVATE_TLS_ACK, originalEnvironment.PRIVATE_TLS_ACK);
  restoreEnvironment('FORTRESS_ENV_PATH', originalEnvironment.FORTRESS_ENV_PATH);
  process.umask(originalUmask);
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('PostgreSQL rejects a missing explicit TLS policy', async () => {
  delete process.env.PG_SSLMODE;
  delete process.env[PRIVATE_TLS_ACK];

  await expect(initDatabase(postgresConfig)).rejects.toThrow('PG_SSLMODE');
});

test('PostgreSQL rejects fallback and unacknowledged plaintext policies', async () => {
  delete process.env[PRIVATE_TLS_ACK];
  for (const sslMode of ['allow', 'prefer', 'disable']) {
    process.env.PG_SSLMODE = sslMode;
    await expect(initDatabase(postgresConfig)).rejects.toThrow('PG_SSLMODE');
  }
});

test('PostgreSQL verify-full enables certificate and hostname verification', async () => {
  process.env.PG_SSLMODE = 'verify-full';

  await initDatabase(postgresConfig);

  expect(pgPool?.options.ssl).toEqual({ rejectUnauthorized: true });
});

test('PostgreSQL require enables encryption without implying certificate verification', async () => {
  process.env.PG_SSLMODE = 'require';

  await initDatabase(postgresConfig);

  expect(pgPool?.options.ssl).toEqual({ rejectUnauthorized: false });
});

test('private PostgreSQL plaintext requires an explicit acknowledgement', async () => {
  process.env.PG_SSLMODE = 'disable';
  process.env[PRIVATE_TLS_ACK] = 'true';

  await initDatabase(postgresConfig);

  expect(pgPool?.options.ssl).toBe(false);
});

test('generated PostgreSQL configuration records an explicit verified TLS policy', () => {
  const directory = temporaryDirectory();
  const envPath = path.join(directory, 'fortress.env');
  fs.writeFileSync(envPath, '', { mode: 0o600 });
  process.env.FORTRESS_ENV_PATH = envPath;

  generateEnvFile({
    dbConfig: postgresConfig,
    aiConfig: { provider: 'None' },
    ssoConfig: {},
    authMode: 'local',
  });

  expect(fs.readFileSync(envPath, 'utf8')).toContain('PG_SSLMODE="verify-full"');
});

test('SQLite creates its directory, database, WAL, and SHM with restrictive permissions', async () => {
  process.umask(0o022);
  const directory = path.join(temporaryDirectory(), 'private', 'database');
  const databasePath = path.join(directory, 'fortress.db');

  await initDatabase({ type: 'sqlite', filePath: databasePath });

  expect(mode(directory)).toBe(0o700);
  expect(mode(databasePath)).toBe(0o600);
  expect(mode(`${databasePath}-wal`)).toBe(0o600);
  expect(mode(`${databasePath}-shm`)).toBe(0o600);
});

test('SQLite repairs permissive pre-existing directory, database, WAL, and SHM modes', async () => {
  process.umask(0o022);
  const directory = temporaryDirectory();
  const databasePath = path.join(directory, 'fortress.db');
  const seed = new Database(databasePath);
  seed.exec('PRAGMA journal_mode = WAL; CREATE TABLE seed (id INTEGER);');
  seed.close();
  fs.writeFileSync(`${databasePath}-wal`, '');
  fs.writeFileSync(`${databasePath}-shm`, '');
  fs.chmodSync(directory, 0o777);
  fs.chmodSync(databasePath, 0o666);
  fs.chmodSync(`${databasePath}-wal`, 0o666);
  fs.chmodSync(`${databasePath}-shm`, 0o666);

  await initDatabase({ type: 'sqlite', filePath: databasePath });

  expect(mode(directory)).toBe(0o700);
  expect(mode(databasePath)).toBe(0o600);
  expect(mode(`${databasePath}-wal`)).toBe(0o600);
  expect(mode(`${databasePath}-shm`)).toBe(0o600);
});
