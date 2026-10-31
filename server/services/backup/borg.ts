/**
 * Borg command builder. Never remove, reinitialize, or prune a repository
 * as part of an ordinary backup. Execution script travels over SSH stdin.
 */
import { sftpTransport } from './sftpTrust.js';
import type { BackupJobConfig } from './types.js';
import { absoluteSources, absoluteRestorePath, quote } from './commandSafety.js';

const prefix = (config: BackupJobConfig):string => {
    if (!config.repoPassword) throw new Error('Borg repository passphrase is required');
    if (!['nfs','sftp'].includes(config.destinationType)) throw new Error('Unsupported Borg storage backend');
    if (!config.destinationPath || /[\u0000-\u001f\u007f]/.test(config.destinationPath))
        throw new Error('Invalid Borg repository path');
    const transport = config.destinationType === 'sftp' ? sftpTransport(config) : null;
    return (transport ? transport.setup + 'export BORG_RSH="$FORTRESS_SSH_COMMAND"; ' : '') + `export BORG_PASSPHRASE=${quote(config.repoPassword)}; `;
};
const repository=(config: BackupJobConfig):string => config.destinationType === 'sftp' ? sftpTransport(config).borgRepository : config.destinationPath;
const archive=(config: BackupJobConfig):string => {
    if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,90}$/.test(config.jobName))
        throw new Error('Invalid Borg archive name');
    return repository(config)+'::'+config.jobName+'-{now:%Y-%m-%d_%H:%M:%S}';
};
const snapshot=(id:string):string => {
    if(!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,150}$/.test(id))throw new Error('Invalid Borg snapshot');
    return id;
};
export const buildBorgCommand=(config:BackupJobConfig):string=>{
    absoluteSources(config.sourcePaths);
    const sources=config.sourcePaths.map(quote).join(' ');
    return `${prefix(config)}borg create --stats --one-file-system --exclude-caches -- ${quote(archive(config))} ${sources}`;
};
export const buildBorgSnapshotListCommand=(config:BackupJobConfig):string =>
    `${prefix(config)}borg list --json -- ${quote(repository(config))}`;
export const buildBorgFileListCommand=(config:BackupJobConfig,id:string):string =>
    `${prefix(config)}borg list --json-lines -- ${quote(repository(config)+'::'+snapshot(id))}`;
export const buildBorgRestoreCommand=(config:BackupJobConfig,id:string,target:string,paths?:string[]):string=>{
    absoluteRestorePath(target);
    const requested=(paths||[]).map(path=>{
        if(typeof path!=='string'||!path||path.startsWith('/')||path.split('/').includes('..'))throw new Error('Invalid Borg restore selection');
        return quote(path);
    }).join(' ');
    return `${prefix(config)}mkdir -p -- ${quote(target)} && cd -- ${quote(target)} && borg extract --sparse -- ${quote(repository(config)+'::'+snapshot(id))}${requested?' '+requested:''}`;
};
