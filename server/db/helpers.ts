/**
 * Database Query Helpers
 */

import { sqliteDb, pgPool, currentConfig } from './connection.js';

export const query = async <T>(sql: string, params: any[] = []): Promise<T[]> => {
    if (currentConfig?.type === 'sqlite' && sqliteDb) {
        const stmt = sqliteDb.prepare(sql);
        return stmt.all(...params) as T[];
    } else if (currentConfig?.type === 'postgres' && pgPool) {
        // Convert ? to $1, $2, etc for PostgreSQL
        let pgSql = sql;
        let paramIndex = 0;
        pgSql = pgSql.replace(/\?/g, () => `$${++paramIndex}`);
        const result = await pgPool.query(pgSql, params);
        return result.rows as T[];
    }
    return [];
};

export const run = async (sql: string, params: any[] = []): Promise<void> => {
    if (currentConfig?.type === 'sqlite' && sqliteDb) {
        const stmt = sqliteDb.prepare(sql);
        stmt.run(...params);
    } else if (currentConfig?.type === 'postgres' && pgPool) {
        let pgSql = sql;
        let paramIndex = 0;
        pgSql = pgSql.replace(/\?/g, () => `$${++paramIndex}`);
        await pgPool.query(pgSql, params);
    }
};

export const getOne = async <T>(sql: string, params: any[] = []): Promise<T | null> => {
    const results = await query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
};
