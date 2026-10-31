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

const keyAlgorithms=new Set([
    'ssh-ed25519','ssh-rsa','ecdsa-sha2-nistp256','ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521','sk-ssh-ed25519@openssh.com','sk-ecdsa-sha2-nistp256@openssh.com'
]);

export const validateHostPublicKey=(value:unknown):string=>{
    if(typeof value!=='string'||value.length>8192||/[\u0000-\u001f\u007f]/.test(value.trim()))
        throw new Error('Invalid SSH host public key');
    const [algorithm,encoded,...comment]=value.trim().split(/\s+/);
    if(!keyAlgorithms.has(algorithm)||!encoded||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
        throw new Error('Invalid SSH host public key');
    const blob=Buffer.from(encoded,'base64');
    if(blob.length<12||blob.toString('base64').replace(/=+$/,'')!==encoded.replace(/=+$/,''))
        throw new Error('Invalid SSH host public key');
    const typeLength=blob.readUInt32BE(0);
    if(typeLength>128||blob.length<4+typeLength||blob.subarray(4,4+typeLength).toString()!==algorithm)
        throw new Error('Invalid SSH host public key');
    return algorithm+' '+encoded+(comment.length?' '+comment.join(' '):'');
};

export const hostKeyEntry=(host:string,port:number,publicKey:unknown):string=>{
    if(!/^[A-Za-z0-9.-]{1,253}$/.test(host)||!Number.isInteger(port)||port<1||port>65535)
        throw new Error('Invalid SSH host or port');
    return `${port===22?host:`[${host}]:${port}`} ${validateHostPublicKey(publicKey)}`;
};

export const trustFileSetup=(entry:string):string=>[
    'FORTRESS_TRUST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/fortress-peer.XXXXXXXXXX") || exit 1',
    'fortress_peer_cleanup() { rm -f -- "$FORTRESS_TRUST_DIR/known_hosts"; rmdir -- "$FORTRESS_TRUST_DIR"; }',
    'trap fortress_peer_cleanup EXIT',
    "trap 'exit 1' HUP INT TERM",
    'chmod 700 "$FORTRESS_TRUST_DIR" || exit 1',
    'umask 077',
    `printf '%s\\n' ${quote(entry)} > "$FORTRESS_TRUST_DIR/known_hosts" || exit 1`,
    'chmod 600 "$FORTRESS_TRUST_DIR/known_hosts" || exit 1',
    ''
].join('\n');

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
