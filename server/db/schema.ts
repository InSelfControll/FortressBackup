/**
 * Database Schema Definitions
 */

import { sqliteDb, pgPool } from './connection.js';

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
      ssh_key_id TEXT
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

  // Schema Migration: Add ssh_key_id to systems if missing
  try {
    const columns = sqliteDb.prepare("PRAGMA table_info(systems)").all() as any[];
    const hasSshKeyId = columns.some(col => col.name === 'ssh_key_id');
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
      ssh_key_id TEXT
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
  `);
};
