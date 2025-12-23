/**
 * Locations Operations
 */

import { run, query, getOne } from './helpers.js';
import { currentConfig } from './connection.js';

export interface Location {
    id: string;
    name: string;
    type: string;
    path: string;
    endpoint?: string;
    region?: string;
    access_key?: string;
    secret_key?: string;
}

export const getAllLocations = async (): Promise<Location[]> => {
    return query<Location>(`SELECT * FROM locations`);
};

export const saveLocation = async (location: Location): Promise<void> => {
    if (currentConfig?.type === 'sqlite') {
        await run(
            `INSERT OR REPLACE INTO locations (id, name, type, path, endpoint, region, access_key, secret_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [location.id, location.name, location.type, location.path, location.endpoint, location.region, location.access_key, location.secret_key]
        );
    } else {
        await run(
            `INSERT INTO locations (id, name, type, path, endpoint, region, access_key, secret_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, type=EXCLUDED.type, path=EXCLUDED.path, endpoint=EXCLUDED.endpoint, region=EXCLUDED.region, access_key=EXCLUDED.access_key, secret_key=EXCLUDED.secret_key`,
            [location.id, location.name, location.type, location.path, location.endpoint, location.region, location.access_key, location.secret_key]
        );
    }
};

export const deleteLocation = async (id: string): Promise<void> => {
    await run(`DELETE FROM locations WHERE id = ?`, [id]);
};

export const getLocation = async (id: string): Promise<Location | null> => {
    return getOne<Location>(`SELECT * FROM locations WHERE id = ?`, [id]);
};
