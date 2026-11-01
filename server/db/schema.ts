/**
 * Database Schema Definitions
 */

import { sqliteDb, pgPool } from './connection.js';

// Shared SQLite/PostgreSQL managed-client schema (single source of truth).
const managedTablesDDL = `
    CREATE TABLE IF NOT EXISTS managed_clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen TEXT,
      disabled INTEGER NOT NULL DEFAULT 0,
      schedule_minutes INTEGER NOT NULL DEFAULT 0,
      next_run_at TEXT,
      capabilities TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS managed_repositories (
      client_id TEXT PRIMARY KEY REFERENCES managed_clients(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS managed_jobs (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES managed_clients(id) ON DELETE CASCADE,
      operation TEXT NOT NULL CHECK (operation IN ('backup','check','snapshots','files','restore')),
      state TEXT NOT NULL CHECK (state IN ('pending','running','success','failed','canceled')),
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      lease_until TEXT,
      schedule_slot TEXT,
      message TEXT,
      request_json TEXT,
      result_json TEXT,
      cancel_requested INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_managed_jobs_client ON managed_jobs(client_id,created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_managed_active ON managed_jobs(client_id)
      WHERE state IN ('pending','running');
`;

/**
 * Create tables for SQLite
 */
export const createTables = () => {
  if (!sqliteDb) return;

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT,
      avatar TEXT,
      role TEXT DEFAULT 'viewer',
      auth_type TEXT DEFAULT 'local',
      github_id TEXT,
      auth_epoch INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS systems (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      username TEXT,
      port INTEGER DEFAULT 22,
      type TEXT DEFAULT 'remote',
      status TEXT DEFAULT 'online',
      last_seen TEXT,
      health INTEGER DEFAULT 100,
      installed_tools TEXT,
      ssh_key_id TEXT,
      host_fingerprint TEXT,
      host_public_key TEXT
    );
    
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      path TEXT NOT NULL,
      endpoint TEXT,
      region TEXT,
      access_key TEXT,
      secret_key TEXT,
      host_public_key TEXT
    );
    
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tool TEXT NOT NULL,
      source_id TEXT,
      destination_id TEXT,
      source_path TEXT,
      repo_password TEXT,
      schedule TEXT,
      retention TEXT,
      priority TEXT DEFAULT 'Medium',
      status TEXT DEFAULT 'Idle',
      run_epoch INTEGER NOT NULL DEFAULT 0,
      schedule_enabled INTEGER NOT NULL DEFAULT 0,
      last_scheduled_for TEXT,
      next_run TEXT,
      last_run TEXT,
      size TEXT,
      stats TEXT,
      FOREIGN KEY (source_id) REFERENCES systems(id),
      FOREIGN KEY (destination_id) REFERENCES locations(id)
    );
    
    CREATE TABLE IF NOT EXISTS ssh_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      private_key_data TEXT,
      passphrase TEXT,
      is_encrypted INTEGER DEFAULT 1,
      expiry_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      key_order INTEGER DEFAULT 0
    );
    
    CREATE TABLE IF NOT EXISTS job_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );
    
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );


  `);

  sqliteDb.exec(managedTablesDDL);

  const managedColumns = sqliteDb.prepare('PRAGMA table_info(managed_jobs)').all() as {name:string}[];
  if (!managedColumns.some(column=>column.name==='schedule_slot')) sqliteDb.exec('ALTER TABLE managed_jobs ADD COLUMN schedule_slot TEXT');
  const oldManaged = sqliteDb.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='managed_jobs'").get() as {sql:string};
  if (!oldManaged.sql.includes("'canceled'")) {
    sqliteDb.transaction(()=>{
      sqliteDb!.exec('DROP TRIGGER IF EXISTS managed_client_cleanup');
      sqliteDb!.exec('ALTER TABLE managed_jobs RENAME TO managed_jobs_legacy');
      sqliteDb!.exec(managedTablesDDL.slice(managedTablesDDL.indexOf('    CREATE TABLE IF NOT EXISTS managed_jobs')));
      const previous = (sqliteDb!.prepare('PRAGMA table_info(managed_jobs_legacy)').all() as {name:string}[]).map(column=>column.name);
      const columns = (sqliteDb!.prepare('PRAGMA table_info(managed_jobs)').all() as {name:string}[]).map(column=>column.name).filter(name=>previous.includes(name)).join(',');
      sqliteDb!.exec(`INSERT INTO managed_jobs(${columns}) SELECT ${columns} FROM managed_jobs_legacy`);
      sqliteDb!.exec('DROP TABLE managed_jobs_legacy');
      // The old table owned the named indexes until it was dropped.
      sqliteDb!.exec(managedTablesDDL.slice(managedTablesDDL.indexOf('    CREATE INDEX')));
    })();
  }
  // Legacy databases do not enable foreign_keys globally. Keep enrollment removal
  // atomic without changing unrelated legacy table behavior.
  sqliteDb.exec(`DROP TRIGGER IF EXISTS managed_client_cleanup;
    CREATE TRIGGER managed_client_cleanup AFTER DELETE ON managed_clients BEGIN
      DELETE FROM managed_jobs WHERE client_id=OLD.id;
      DELETE FROM managed_repositories WHERE client_id=OLD.id;
    END;`);
  const clients = sqliteDb.prepare('PRAGMA table_info(managed_clients)').all() as {name:string}[];
  if (!clients.some(column=>column.name==='capabilities')) sqliteDb.exec("ALTER TABLE managed_clients ADD COLUMN capabilities TEXT NOT NULL DEFAULT '[]'");
  const jobActivity = sqliteDb.prepare('PRAGMA table_info(jobs)').all() as {name:string}[];
  if (!jobActivity.some(column=>column.name==='operation')) sqliteDb.exec("ALTER TABLE jobs ADD COLUMN operation TEXT NOT NULL DEFAULT 'backup'");
  if (!jobActivity.some(column=>column.name==='operation_at')) sqliteDb.exec('ALTER TABLE jobs ADD COLUMN operation_at TEXT');

  if (!jobActivity.some(column=>column.name==='cancel_requested')) sqliteDb.exec('ALTER TABLE jobs ADD COLUMN cancel_requested INTEGER NOT NULL DEFAULT 0');

  // Schema Migration: Add ssh_key_id to systems if missing
  try {
    const userColumns = sqliteDb.prepare("PRAGMA table_info(users)").all() as any[];
    if (!userColumns.some(col => col.name === 'github_id'))
      sqliteDb.prepare('ALTER TABLE users ADD COLUMN github_id TEXT').run();
    if (!userColumns.some(col => col.name === 'auth_epoch'))
      sqliteDb.prepare('ALTER TABLE users ADD COLUMN auth_epoch INTEGER NOT NULL DEFAULT 0').run();
    sqliteDb.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id) WHERE github_id IS NOT NULL').run();
    const columns = sqliteDb.prepare("PRAGMA table_info(systems)").all() as any[];
    const jobColumns = sqliteDb.prepare('PRAGMA table_info(jobs)').all() as any[];
    if (!jobColumns.some(col => col.name === 'schedule_enabled')) sqliteDb.prepare('ALTER TABLE jobs ADD COLUMN schedule_enabled INTEGER NOT NULL DEFAULT 0').run();
    if (!jobColumns.some(col => col.name === 'last_scheduled_for')) sqliteDb.prepare('ALTER TABLE jobs ADD COLUMN last_scheduled_for TEXT').run();
    if (!jobColumns.some(col => col.name === 'run_epoch'))
      sqliteDb.prepare('ALTER TABLE jobs ADD COLUMN run_epoch INTEGER NOT NULL DEFAULT 0').run();
    const locationColumns = sqliteDb.prepare('PRAGMA table_info(locations)').all() as any[];
    const managedColumns=sqliteDb.prepare('PRAGMA table_info(managed_jobs)').all() as any[];
    if (!managedColumns.some(col=>col.name==='schedule_slot'))
      sqliteDb.prepare('ALTER TABLE managed_jobs ADD COLUMN schedule_slot TEXT').run();
    sqliteDb.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_managed_schedule_slot ON managed_jobs(client_id,schedule_slot) WHERE schedule_slot IS NOT NULL').run();
    const hasSshKeyId = columns.some(col => col.name === 'ssh_key_id');
    if (!columns.some(col => col.name === 'host_fingerprint')) sqliteDb.prepare('ALTER TABLE systems ADD COLUMN host_fingerprint TEXT').run();
    if (!columns.some(col => col.name === 'host_public_key')) sqliteDb.prepare('ALTER TABLE systems ADD COLUMN host_public_key TEXT').run();
    if (!locationColumns.some(col => col.name === 'host_public_key')) sqliteDb.prepare('ALTER TABLE locations ADD COLUMN host_public_key TEXT').run();
    if (!hasSshKeyId) {
      console.log('[DB] Migrating: Adding ssh_key_id to systems table');
      sqliteDb.prepare("ALTER TABLE systems ADD COLUMN ssh_key_id TEXT").run();
    }
  } catch (err: any) {
    console.error('[DB] Schema migration failed:', err.message);
  }
};

/**
 * Create tables for PostgreSQL
 */
export const createTablesPostgres = async () => {
  if (!pgPool) return;

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT,
      avatar TEXT,
      role TEXT DEFAULT 'viewer',
      auth_type TEXT DEFAULT 'local',
      github_id TEXT,
      auth_epoch INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS systems (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      username TEXT,
      port INTEGER DEFAULT 22,
      type TEXT DEFAULT 'remote',
      status TEXT DEFAULT 'online',
      last_seen TEXT,
      health INTEGER DEFAULT 100,
      installed_tools TEXT,
      ssh_key_id TEXT,
      host_fingerprint TEXT,
      host_public_key TEXT
    );
    
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      path TEXT NOT NULL,
      endpoint TEXT,
      region TEXT,
      access_key TEXT,
      secret_key TEXT,
      host_public_key TEXT
    );
    
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tool TEXT NOT NULL,
      source_id TEXT REFERENCES systems(id),
      destination_id TEXT REFERENCES locations(id),
      source_path TEXT,
      repo_password TEXT,
      schedule TEXT,
      retention TEXT,
      priority TEXT DEFAULT 'Medium',
      status TEXT DEFAULT 'Idle',
      run_epoch INTEGER NOT NULL DEFAULT 0,
      schedule_enabled INTEGER NOT NULL DEFAULT 0,
      last_scheduled_for TEXT,
      next_run TEXT,
      last_run TEXT,
      size TEXT,
      stats TEXT
    );
    
    CREATE TABLE IF NOT EXISTS ssh_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      private_key_data TEXT,
      passphrase TEXT,
      is_encrypted BOOLEAN DEFAULT true,
      expiry_date TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      key_order INTEGER DEFAULT 0
    );
    
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS job_logs (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_job_logs_lookup ON job_logs(job_id,timestamp);



  `);
  await pgPool.query(managedTablesDDL);
  await pgPool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS github_id TEXT');
  await pgPool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_epoch INTEGER NOT NULL DEFAULT 0');
  await pgPool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id) WHERE github_id IS NOT NULL');
  await pgPool.query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS run_epoch INTEGER NOT NULL DEFAULT 0');
  await pgPool.query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS schedule_enabled INTEGER NOT NULL DEFAULT 0');
  await pgPool.query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_scheduled_for TEXT');
  await pgPool.query('ALTER TABLE systems ADD COLUMN IF NOT EXISTS host_fingerprint TEXT');
  await pgPool.query('ALTER TABLE systems ADD COLUMN IF NOT EXISTS host_public_key TEXT');
  await pgPool.query('ALTER TABLE locations ADD COLUMN IF NOT EXISTS host_public_key TEXT');
  await pgPool.query('ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS schedule_slot TEXT');
  await pgPool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_managed_schedule_slot ON managed_jobs(client_id,schedule_slot) WHERE schedule_slot IS NOT NULL');
  await pgPool.query("ALTER TABLE managed_clients ADD COLUMN IF NOT EXISTS capabilities TEXT NOT NULL DEFAULT '[]'");
  await pgPool.query('ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS request_json TEXT');
  await pgPool.query('ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS result_json TEXT');
  await pgPool.query('ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS cancel_requested INTEGER NOT NULL DEFAULT 0');
  await pgPool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS operation TEXT NOT NULL DEFAULT 'backup'");
  await pgPool.query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS operation_at TEXT');
  await pgPool.query('ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cancel_requested INTEGER NOT NULL DEFAULT 0');
  const migration = await pgPool.connect();
  try {
    await migration.query('BEGIN');
    await migration.query('ALTER TABLE managed_jobs DROP CONSTRAINT IF EXISTS managed_jobs_operation_check');
    await migration.query("ALTER TABLE managed_jobs ADD CONSTRAINT managed_jobs_operation_check CHECK(operation IN ('backup','check','snapshots','files','restore'))");
    await migration.query('ALTER TABLE managed_jobs DROP CONSTRAINT IF EXISTS managed_jobs_state_check');
    await migration.query("ALTER TABLE managed_jobs ADD CONSTRAINT managed_jobs_state_check CHECK(state IN ('pending','running','success','failed','canceled'))");
    await migration.query('ALTER TABLE managed_jobs DROP CONSTRAINT IF EXISTS managed_jobs_client_id_fkey');
    await migration.query('ALTER TABLE managed_jobs ADD CONSTRAINT managed_jobs_client_id_fkey FOREIGN KEY(client_id) REFERENCES managed_clients(id) ON DELETE CASCADE');
    await migration.query('COMMIT');
  } catch(error) {await migration.query('ROLLBACK');throw error} finally {migration.release()}

};
