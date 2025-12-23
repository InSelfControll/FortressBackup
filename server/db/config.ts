/**
 * Config Operations
 */

import { run, getOne } from './helpers.js';
import { currentConfig } from './connection.js';

export const saveConfig = async (key: string, value: any): Promise<void> => {
    const jsonValue = JSON.stringify(value);

    if (currentConfig?.type === 'sqlite') {
        await run(`INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`, [key, jsonValue]);
    } else {
        await run(`INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, jsonValue]);
    }
};

export const getConfig = async <T>(key: string): Promise<T | null> => {
    const result = await getOne<{ value: string }>(`SELECT value FROM config WHERE key = ?`, [key]);
    if (!result) return null;
    return JSON.parse(result.value);
};
