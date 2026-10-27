/**
 * Job logs: bounded, atomic persistence without N+1 connections.
 * Limit last-run logs so a noisy backup cannot exhaust DB or memory.
 */
import { query } from './helpers.js';
import { sqliteDb, pgPool } from './connection.js';

export interface JobLog {
    id?:number;job_id:string;run_id:string;type:string;message:string;timestamp:string;
}
const LOG_LIMIT=2000, MESSAGE_LIMIT=2048;
export const saveJobLogs=async(
    jobId:string,runId:string,logs:Array<{type:string;message:string;timestamp:Date}>,
):Promise<void>=>{
    const rows=logs.slice(-LOG_LIMIT).map(log=>[
        jobId,runId,log.type.slice(0,32),log.message.slice(0,MESSAGE_LIMIT),log.timestamp.toISOString()
    ]);
    if(sqliteDb){
        const insert=sqliteDb.prepare('INSERT INTO job_logs(job_id,run_id,type,message,timestamp) VALUES (?,?,?,?,?)');
        sqliteDb.transaction(()=>{
            sqliteDb.prepare('DELETE FROM job_logs WHERE job_id=?').run(jobId);
            for(const row of rows)insert.run(...row);
        })();
        return;
    }
    if(pgPool){
        const conn=await pgPool.connect();
        try{
            await conn.query('BEGIN');
            await conn.query('DELETE FROM job_logs WHERE job_id=$1',[jobId]);
            const chunks=100;
            for(let offset=0;offset<rows.length;offset+=chunks){
                const batch=rows.slice(offset,offset+chunks);
                const args=batch.flat();
                const tuples=batch.map((_,i)=>{
                    const first=i*5;
                    return '('+Array.from({length:5},(_,j)=>'$'+(first+j+1)).join(',')+')';
                }).join(',');
                await conn.query('INSERT INTO job_logs(job_id,run_id,type,message,timestamp) VALUES '+tuples,args);
            }
            await conn.query('COMMIT');
        }catch(e){await conn.query('ROLLBACK');throw e;}finally{conn.release();}
        return;
    }
    throw new Error('Backup database unavailable');
};
export const getJobLogs=async(jobId:string):Promise<JobLog[]> =>
    query<JobLog>('SELECT id,job_id,run_id,type,message,timestamp FROM job_logs WHERE job_id=? ORDER BY timestamp ASC LIMIT 2000',[jobId]);
