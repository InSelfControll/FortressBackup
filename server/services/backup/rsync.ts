/**
 * Strict rsync command builder. Source hosts and paths are constrained before
 * constructing legacy SSH stdin scripts.
 */
import type { BackupJobConfig, SSHConfig } from './types.js';
import {absoluteSources,absoluteRestorePath,quote} from './commandSafety.js';

const flags=[
    '-a','--stats','--one-file-system','--exclude=/mnt','--exclude=/media',
    '--exclude=/run/media','--exclude=/run','--exclude=/proc',
    '--exclude=/sys','--exclude=/dev',
].join(' ');

export { validateHostPublicKey, hostKeyEntry, trustFileSetup } from './sshTrust.js';
import { hostKeyEntry, trustFileSetup } from './sshTrust.js';
import { sftpTransport } from './sftpTrust.js';

const validateRemotePath=(value:string):string=>{
    if (typeof value!=='string' ||
        !/^\/[A-Za-z0-9._\/-]{0,2047}$/.test(value) ||
        value.split('/').includes('..') || value.includes('//'))
        throw new Error('Rsync source must be a restricted absolute remote path');
    return value;
};
const requireHost=(ssh:SSHConfig & {hostPublicKey?:string}):string=>{
    if(!/^[A-Za-z0-9._-]{1,120}$/.test(ssh.username) ||
       !/^[A-Za-z0-9.-]{1,253}$/.test(ssh.host) ||
       !Number.isInteger(ssh.port)||ssh.port<1||ssh.port>65535 ||
       !ssh.hostFingerprint || !/^SHA256:[A-Za-z0-9+/]{43}=?$/.test(ssh.hostFingerprint) ||
       !ssh.hostPublicKey)
        throw new Error('Rsync SSH peer must have an enrolled host public key, verified identity, host and port');
    return hostKeyEntry(ssh.host,ssh.port,ssh.hostPublicKey);
};

export const buildRsyncCommand=(
    config:BackupJobConfig,sshConfig?:SSHConfig & {hostPublicKey?:string},isLocal=false,
):string=>{
    if (!isLocal && config.destinationType === 'sftp') {
        const peer = sftpTransport(config);
        if (!/^[A-Za-z0-9._/-]+$/.test(peer.path) || peer.path.split('/').includes('..')) throw new Error('Rsync SFTP destination must be a restricted remote path');
        const sources = absoluteSources(config.sourcePaths).map(quote);
        return peer.setup + `rsync ${flags} -e "$FORTRESS_SSH_COMMAND" -- ${sources.join(' ')} ${quote(peer.target+':'+peer.path)}`;
    }
    absoluteRestorePath(config.destinationPath);
    const destination=quote(config.destinationPath);
    if(isLocal){
        if(!sshConfig)throw new Error('Local Rsync pull requires authenticated SSH configuration');
        const hostEntry=requireHost(sshConfig);
        // The rsync remote path is also interpreted by the remote shell;
        // this deliberately restricts it to a conservative pathname alphabet.
        const sources=absoluteSources(config.sourcePaths).map(source=>{
            validateRemotePath(source);
            return quote(sshConfig.username+'@'+sshConfig.host+':'+source);
        });
        if(!sources.length)throw new Error('No sources configured');
        const sshCommandStart=[
            'ssh','-o BatchMode=yes','-o StrictHostKeyChecking=yes',
            '-o IdentitiesOnly=yes','-o GlobalKnownHostsFile=/dev/null','-o'
        ].join(' ');
        const sshCommandEnd=` -p ${sshConfig.port} -i %%KEYFILE%%`;
        const sshCommand=`${quote(sshCommandStart+' ')}UserKnownHostsFile="$FORTRESS_TRUST_DIR/known_hosts"${quote(sshCommandEnd)}`;
        return trustFileSetup(hostEntry)+`rsync ${flags} -e ${sshCommand} -- ${sources.join(' ')} ${destination}`;
    }
    const sources=absoluteSources(config.sourcePaths).map(quote);
    return `rsync ${flags} -- ${sources.join(' ')} ${destination}`;
};
