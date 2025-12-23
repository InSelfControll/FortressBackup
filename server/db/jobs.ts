/**
 * Jobs Operations
 */

import { run, query, getOne } from './helpers.js';
import { currentConfig } from './connection.js';

export interface Job {
    id: string;
    name: string;
    tool: string;
    source_id?: string;
    destination_id?: string;
    source_path?: string;
    repo_password?: string;
    schedule?: string;
    retention?: string;
    priority: string;
    status: string;
    next_run?: string;
    last_run?: string;
    size?: string;
    stats?: string;
}

export const getAllJobs = async (): Promise<Job[]> => {
    return query<Job>(`SELECT * FROM jobs`);
};

export const saveJob = async (job: Job): Promise<void> => {
    if (currentConfig?.type === 'sqlite') {
        await run(
            `INSERT OR REPLACE INTO jobs (id, name, tool, source_id, destination_id, source_path, repo_password, schedule, retention, priority, status, next_run, last_run, size, stats) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [job.id, job.name, job.tool, job.source_id, job.destination_id, job.source_path, job.repo_password, job.schedule, job.retention, job.priority, job.status, job.next_run, job.last_run, job.size, job.stats]
        );
    } else {
        await run(
            `INSERT INTO jobs (id, name, tool, source_id, destination_id, source_path, repo_password, schedule, retention, priority, status, next_run, last_run, size, stats) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, tool=EXCLUDED.tool, source_id=EXCLUDED.source_id, destination_id=EXCLUDED.destination_id, source_path=EXCLUDED.source_path, repo_password=EXCLUDED.repo_password, schedule=EXCLUDED.schedule, retention=EXCLUDED.retention, priority=EXCLUDED.priority, status=EXCLUDED.status, next_run=EXCLUDED.next_run, last_run=EXCLUDED.last_run, size=EXCLUDED.size, stats=EXCLUDED.stats`,
            [job.id, job.name, job.tool, job.source_id, job.destination_id, job.source_path, job.repo_password, job.schedule, job.retention, job.priority, job.status, job.next_run, job.last_run, job.size, job.stats]
        );
    }
};

export const deleteJob = async (id: string): Promise<void> => {
    await run(`DELETE FROM jobs WHERE id = ?`, [id]);
};

export const getJob = async (id: string): Promise<Job | null> => {
    return getOne<Job>(`SELECT * FROM jobs WHERE id = ?`, [id]);
};
