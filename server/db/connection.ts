/**
 * Database Connection Management
 * Uses Bun's built-in SQLite module for native performance
 */

import { Database } from 'bun:sqlite';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import { DatabaseConfig } from './types.ts';
import { createTables, createTablesPostgres } from './schema.ts';

export let sqliteDb: Database | null = null;
export let pgPool: Pool | null = null;
export let currentConfig: DatabaseConfig | null = null;

/**
 * Initialize database connection
 */
export const initDatabase = async (config: DatabaseConfig): Promise<void> => {
    currentConfig = config;

    if (config.type === 'sqlite') {
        const dbPath = config.filePath || path.join(process.cwd(), 'data', 'fortress.db');
        const isMemoryDatabase = dbPath === ':memory:';
        const sqliteFiles = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
        const secureSQLiteFiles = () => {
            for (const filePath of sqliteFiles) {
                if (fs.existsSync(filePath)) fs.chmodSync(filePath, 0o600);
            }
        };

        if (!isMemoryDatabase) {
            const dir = path.dirname(dbPath);
            fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
            fs.chmodSync(dir, 0o700);
            secureSQLiteFiles();
            const descriptor = fs.openSync(dbPath, 'a', 0o600);
            fs.closeSync(descriptor);
            fs.chmodSync(dbPath, 0o600);
        }

        const previousUmask = isMemoryDatabase ? null : process.umask(0o077);
        try {
            sqliteDb = new Database(dbPath);
            sqliteDb.exec('PRAGMA journal_mode = WAL');

            // Schema setup needs to access sqliteDb, so we export it
            createTables();
            if (!isMemoryDatabase) secureSQLiteFiles();
        } finally {
            if (previousUmask !== null) process.umask(previousUmask);
        }
        console.log(`[DB] SQLite (bun:sqlite) initialized at: ${dbPath}`);
    } else if (config.type === 'postgres') {
        const sslMode = process.env.PG_SSLMODE;
        let ssl: false | { rejectUnauthorized: boolean };
        if (sslMode === 'verify-full') {
            ssl = { rejectUnauthorized: true };
        } else if (sslMode === 'require') {
            ssl = { rejectUnauthorized: false };
        } else if (sslMode === 'disable' && process.env.FORTRESS_ALLOW_PRIVATE_POSTGRES_WITHOUT_TLS === 'true') {
            ssl = false;
        } else if (sslMode === 'disable') {
            throw new Error('PG_SSLMODE=disable requires FORTRESS_ALLOW_PRIVATE_POSTGRES_WITHOUT_TLS=true on a private network');
        } else {
            throw new Error('PG_SSLMODE must be explicitly set to verify-full, require, or the acknowledged private-network disable exception');
        }

        pgPool = new Pool({
            host: config.host || 'localhost',
            port: config.port || 5432,
            database: config.database || 'fortress',
            user: config.username,
            password: config.password,
            ssl
        });

        await createTablesPostgres();
        console.log(`[DB] PostgreSQL connected: ${config.host}:${config.port}`);
    }
};

export const closeDatabase = async (): Promise<void> => {
    if (sqliteDb) {
        sqliteDb.close();
        sqliteDb = null;
    }
    if (pgPool) {
        await pgPool.end();
        pgPool = null;
    }
};

export const isInitialized = (): boolean => {
    return sqliteDb !== null || pgPool !== null;
};
