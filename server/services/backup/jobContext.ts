/**
 * Single validated execution context for legacy jobs.
 * Prevents security and destination rules drifting between list/run/restore.
 */
import * as db from '../../db/index.js';
import { toAPIJob } from '../../utils/mappers.js';
import { resolveSSHCredentialsFromRequest } from '../../utils/sshCredentials.js';
import { decrypt } from '../../encryption.js';
import { getJwtSecret } from '../../middleware/auth.js';
import type { SSHConfig, BackupJobConfig } from './types.js';

const mapping:Record<string,BackupJobConfig['tool']>={
  'BorgBackup':'borg','Restic':'restic','Rsync':'rsync',
  'borg':'borg','restic':'restic','rsync':'rsync',
};
export async function buildJobExecutionContext(job:db.Job, credentialsInput:Record<string,unknown>={}, targetSystemId?:string){
  const apiJob=toAPIJob(job);
  if(!apiJob)throw new Error('Backup job not found');
  const system=await db.getSystem(targetSystemId||apiJob.sourceId);
  if(!system)throw new Error('Backup source/target system not found');
  const destination=await db.getLocation(apiJob.destinationId);
  if(!destination)throw new Error('Backup destination not found');
  const credentials=await resolveSSHCredentialsFromRequest(credentialsInput,system.ssh_key_id);
  const tool=mapping[apiJob.tool];
  if(!tool)throw new Error('Unsupported backup engine');
  if(!Array.isArray(apiJob.sourcePaths)||!apiJob.sourcePaths.length)
    throw new Error('No backup source paths');
  const sshConfig:SSHConfig={
    host:system.host,port:system.port||22,username:system.username||'root',
    hostFingerprint:system.host_fingerprint||'',
    privateKey:credentials.privateKey,passphrase:credentials.passphrase,password:credentials.password
  };
  const jobConfig:BackupJobConfig={
    jobId:apiJob.id,jobName:String(apiJob.name).replace(/\s+/g,'_'),
    tool,sourcePaths:apiJob.sourcePaths,
    destinationType:destination.type as BackupJobConfig['destinationType'],
    destinationPath:destination.path,
    destinationEndpoint:destination.endpoint,
    destinationRegion:destination.region,
    destinationAccessKey:destination.access_key,
    destinationSecretKey:destination.secret_key,
    repoPassword:job.repo_password?decrypt(JSON.parse(job.repo_password),getJwtSecret()):undefined,
    retention:apiJob.retention
  };
  return {apiJob,sourceSystem:system,sshConfig,jobConfig};
}
