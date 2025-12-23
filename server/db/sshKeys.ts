/**
 * SSH Keys Operations
 */

import { run, query, getOne } from './helpers.js';
import { currentConfig } from './connection.js';

export interface SSHKey {
    id: string;
    name: string;
    private_key_data: string;
    passphrase?: string;
    is_encrypted: boolean;
    expiry_date?: string;
    created_at?: string;
    key_order?: number;
}

export const getAllSSHKeys = async (): Promise<SSHKey[]> => {
    return query<SSHKey>(`SELECT * FROM ssh_keys ORDER BY key_order ASC, created_at DESC`);
};

export const getSSHKey = async (id: string): Promise<SSHKey | null> => {
    return getOne<SSHKey>(`SELECT * FROM ssh_keys WHERE id = ?`, [id]);
};

export const saveSSHKey = async (key: SSHKey): Promise<void> => {
    if (currentConfig?.type === 'sqlite') {
        await run(
            `INSERT OR REPLACE INTO ssh_keys (id, name, private_key_data, passphrase, is_encrypted, expiry_date, created_at, key_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [key.id, key.name, key.private_key_data, key.passphrase, key.is_encrypted ? 1 : 0, key.expiry_date, key.created_at, key.key_order]
        );
    } else {
        await run(
            `INSERT INTO ssh_keys (id, name, private_key_data, passphrase, is_encrypted, expiry_date, created_at, key_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, private_key_data=EXCLUDED.private_key_data, passphrase=EXCLUDED.passphrase, is_encrypted=EXCLUDED.is_encrypted, expiry_date=EXCLUDED.expiry_date, key_order=EXCLUDED.key_order`,
            [key.id, key.name, key.private_key_data, key.passphrase, key.is_encrypted, key.expiry_date, key.created_at, key.key_order]
        );
    }
};

export const deleteSSHKey = async (id: string): Promise<void> => {
    await run(`DELETE FROM ssh_keys WHERE id = ?`, [id]);
};
