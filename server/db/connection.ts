/**
 * Database Connection Management
 */

import Database from 'better-sqlite3';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import { DatabaseConfig } from './types.ts';
import { createTables, createTablesPostgres } from './schema.ts';

export let sqliteDb: Database.Database | null = null;
export let pgPool: Pool | null = null;
export let currentConfig: DatabaseConfig | null = null;

/**
 * Initialize database connection
 */
export const initDatabase = async (config: DatabaseConfig): Promise<void> => {
    currentConfig = config;

    if (config.type === 'sqlite') {
        const dbPath = config.filePath || path.join(process.cwd(), 'data', 'fortress.db');

        // Ensure directory exists
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        sqliteDb = new Database(dbPath);
        sqliteDb.pragma('journal_mode = WAL');

        // Schema setup needs to access sqliteDb, so we export it
        createTables();
        console.log(`[DB] SQLite initialized at: ${dbPath}`);
    } else if (config.type === 'postgres') {
        pgPool = new Pool({
            host: config.host || 'localhost',
            port: config.port || 5432,
            database: config.database || 'fortress',
            user: config.username,
            password: config.password
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
