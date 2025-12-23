/**
 * API/DB Mappers - Convert between API format and database format
 */

export const toAPIJob = (job: any) => {
    if (!job) return null;
    return {
        ...job,
        sourceId: job.source_id,
        destinationId: job.destination_id,
        // Map source_path (DB column) to sourcePaths (API array)
        sourcePaths: job.source_path && typeof job.source_path === 'string'
            ? JSON.parse(job.source_path)
            : job.source_paths || ['/home'], // Fallback for legacy or plural property
        repoPassword: job.repo_password,
        retention: job.retention && typeof job.retention === 'string' ? JSON.parse(job.retention) : job.retention,
        stats: job.stats && typeof job.stats === 'string' ? JSON.parse(job.stats) : job.stats,
    };
};

export const toDBJob = (job: any) => {
    return {
        ...job,
        source_id: job.sourceId || job.source_id,
        destination_id: job.destinationId || job.destination_id,
        // Map sourcePaths (API array) to source_path (DB column)
        source_path: Array.isArray(job.sourcePaths)
            ? JSON.stringify(job.sourcePaths)
            : job.source_path || job.sourcePath,
        repo_password: job.repoPassword || job.repo_password,
        retention: typeof job.retention === 'object' ? JSON.stringify(job.retention) : job.retention,
        stats: typeof job.stats === 'object' ? JSON.stringify(job.stats) : job.stats,
    };
};

export const toAPISystem = (sys: any) => {
    if (!sys) return null;
    return {
        ...sys,
        installedTools: sys.installed_tools && typeof sys.installed_tools === 'string' ? JSON.parse(sys.installed_tools) : [],
        lastSeen: sys.last_seen,
        sshKeyId: sys.ssh_key_id
    };
};

export const toDBSystem = (sys: any) => {
    return {
        ...sys,
        installed_tools: Array.isArray(sys.installedTools) ? JSON.stringify(sys.installedTools) : sys.installed_tools,
        last_seen: sys.lastSeen || sys.last_seen,
        ssh_key_id: sys.sshKeyId || sys.ssh_key_id
    };
};
