/**
 * Amortized O(1) bounded log buffer for verbose backup jobs.
 * Drops the oldest quarter in one batch instead of shifting per message.
 */
export const MAX_JOB_LOGS = 2000;
export function appendBoundedJobLog<T>(logs:T[], entry:T):void {
    if(logs.length>=MAX_JOB_LOGS)
        logs.splice(0,MAX_JOB_LOGS/4);
    logs.push(entry);
}
