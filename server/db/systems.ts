/**
 * Systems Operations
 */

import { run, query, getOne } from './helpers.js';
import { currentConfig } from './connection.js';

export interface System {
    id: string;
    name: string;
    host: string;
    username?: string;
    port?: number;
    type: 'local' | 'remote';
    status: 'online' | 'offline';
    last_seen?: string;
    health: number;
    installed_tools?: string;
    ssh_key_id?: string;
}

export const getAllSystems = async (): Promise<System[]> => {
    return query<System>(`SELECT * FROM systems`);
};

export const saveSystem = async (system: System): Promise<void> => {
    if (currentConfig?.type === 'sqlite') {
        await run(
            `INSERT OR REPLACE INTO systems (id, name, host, username, port, type, status, last_seen, health, installed_tools, ssh_key_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [system.id, system.name, system.host, system.username, system.port, system.type, system.status, system.last_seen, system.health, system.installed_tools, system.ssh_key_id]
        );
    } else {
        await run(
            `INSERT INTO systems (id, name, host, username, port, type, status, last_seen, health, installed_tools, ssh_key_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, host=EXCLUDED.host, username=EXCLUDED.username, port=EXCLUDED.port, type=EXCLUDED.type, status=EXCLUDED.status, last_seen=EXCLUDED.last_seen, health=EXCLUDED.health, installed_tools=EXCLUDED.installed_tools, ssh_key_id=EXCLUDED.ssh_key_id`,
            [system.id, system.name, system.host, system.username, system.port, system.type, system.status, system.last_seen, system.health, system.installed_tools, system.ssh_key_id]
        );
    }
};

export const deleteSystem = async (id: string): Promise<void> => {
    await run(`DELETE FROM systems WHERE id = ?`, [id]);
};

export const getSystem = async (id: string): Promise<System | null> => {
    return getOne<System>(`SELECT * FROM systems WHERE id = ?`, [id]);
};
