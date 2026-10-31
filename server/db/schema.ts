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
      next_run_at TEXT
    );
    CREATE TABLE IF NOT EXISTS managed_jobs (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES managed_clients(id),
      operation TEXT NOT NULL CHECK (operation IN ('backup','check','snapshots')),
      state TEXT NOT NULL CHECK (state IN ('pending','running','success','failed')),
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      lease_until TEXT,
      schedule_slot TEXT,
      message TEXT
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
      host_fingerprint TEXT
    );
    
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      path TEXT NOT NULL,
      endpoint TEXT,
      region TEXT,
      access_key TEXT,
      secret_key TEXT
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

  // Schema Migration: Add ssh_key_id to systems if missing
  try {
    const userColumns = sqliteDb.prepare("PRAGMA table_info(users)").all() as any[];
    if (!userColumns.some(col => col.name === 'github_id'))
      sqliteDb.prepare('ALTER TABLE users ADD COLUMN github_id TEXT').run();
    if (!userColumns.some(col => col.name === 'auth_epoch'))
      sqliteDb.prepare('ALTER TABLE users ADD COLUMN auth_epoch INTEGER NOT NULL DEFAULT 0').run();
    sqliteDb.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id) WHERE github_id IS NOT NULL').run();
    const columns = sqliteDb.prepare("PRAGMA table_info(systems)").all() as any[];
    const managedColumns=sqliteDb.prepare('PRAGMA table_info(managed_jobs)').all() as any[];
    if (!managedColumns.some(col=>col.name==='schedule_slot'))
      sqliteDb.prepare('ALTER TABLE managed_jobs ADD COLUMN schedule_slot TEXT').run();
    sqliteDb.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_managed_schedule_slot ON managed_jobs(client_id,schedule_slot) WHERE schedule_slot IS NOT NULL').run();
    const hasSshKeyId = columns.some(col => col.name === 'ssh_key_id');
    if (!columns.some(col => col.name === 'host_fingerprint')) sqliteDb.prepare('ALTER TABLE systems ADD COLUMN host_fingerprint TEXT').run();
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
      host_fingerprint TEXT
    );
    
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      path TEXT NOT NULL,
      endpoint TEXT,
      region TEXT,
      access_key TEXT,
      secret_key TEXT
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
  await pgPool.query('ALTER TABLE systems ADD COLUMN IF NOT EXISTS host_fingerprint TEXT');
  await pgPool.query('ALTER TABLE managed_jobs ADD COLUMN IF NOT EXISTS schedule_slot TEXT');
  await pgPool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_managed_schedule_slot ON managed_jobs(client_id,schedule_slot) WHERE schedule_slot IS NOT NULL');
};
