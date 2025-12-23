/**
 * Job Logs Operations
 */

import { run, query } from './helpers.js';
import { sqliteDb, pgPool } from './connection.js';

export interface JobLog {
    id?: number;
    job_id: string;
    run_id: string;
    type: string;
    message: string;
    timestamp: string;
}

export const saveJobLogs = async (jobId: string, runId: string, logs: Array<{ type: string; message: string; timestamp: Date }>): Promise<void> => {
    // Clear old logs for this job (keep only last run)
    await run(`DELETE FROM job_logs WHERE job_id = ?`, [jobId]);

    // Insert new logs
    for (const log of logs) {
        if (sqliteDb) {
            const stmt = sqliteDb.prepare(
                `INSERT INTO job_logs (job_id, run_id, type, message, timestamp) VALUES (?, ?, ?, ?, ?)`
            );
            stmt.run(jobId, runId, log.type, log.message, log.timestamp.toISOString());
        } else if (pgPool) {
            await pgPool.query(
                `INSERT INTO job_logs (job_id, run_id, type, message, timestamp) VALUES ($1, $2, $3, $4, $5)`,
                [jobId, runId, log.type, log.message, log.timestamp.toISOString()]
            );
        }
    }
};

export const getJobLogs = async (jobId: string): Promise<JobLog[]> => {
    const rows = await query<JobLog>(`SELECT * FROM job_logs WHERE job_id = ? ORDER BY timestamp ASC`, [jobId]);
    return rows;
};
