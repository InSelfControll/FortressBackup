/**
 * Restic command builder. All user-supplied values are POSIX shell-quoted.
 * Use a single target resolver for backup, listing, and restore.
 *
 * TODO: migrate remote execution to an argv/agent protocol so credentials
 * never appear inside the SSH command line.
 */
import { BackupJobConfig } from './types.js';
import { quote as sh, absoluteSources, absoluteRestorePath } from './commandSafety.js';
import { hostKeyEntry, trustFileSetup, validateHostPublicKey } from './rsync.js';

type ResticConfig = BackupJobConfig & { destinationHostPublicKey?: string };

const getRepository = (config: BackupJobConfig): string => {
    const path = config.destinationPath;
    if (typeof path !== 'string' || !path || /[\u0000-\u001f\u007f]/.test(path)) throw new Error('Invalid repository path');
    switch (config.destinationType) {
        case 'sftp': return path.startsWith('sftp:') ? path : `sftp:${path}`;
        case 's3':
            return config.destinationEndpoint
                ? `s3:${config.destinationEndpoint}/${path}`
                : `s3:s3.${config.destinationRegion || 'us-east-1'}.amazonaws.com/${path}`;
        case 'b2': return `b2:${path}`;
        case 'nfs': return path;
        default: throw new Error('Unsupported Restic destination type');
    }
};

const sftpPeer=(repository:string):{target:string;host:string;port:number}=>{
    const path=repository.slice(5);
    const match=path.startsWith('//')
        ? /^\/\/(?:([A-Za-z0-9._-]{1,120})@)?([A-Za-z0-9.-]{1,253})(?::([0-9]{1,5}))?(?:\/|$)/.exec(path)
        : /^(?:([A-Za-z0-9._-]{1,120})@)?([A-Za-z0-9.-]{1,253}):/.exec(path);
    if(!match)throw new Error('Invalid Restic SFTP target');
    const port=match[3]?Number(match[3]):22;
    if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid Restic SFTP port');
    return {target:`${match[1]?match[1]+'@':''}${match[2]}`,host:match[2],port};
};

const resticPrefix = (config: ResticConfig): string => {
    const variables: Record<string, string | undefined> = {
        RESTIC_PASSWORD: config.repoPassword,
        AWS_ACCESS_KEY_ID: config.destinationType === 's3' ? config.destinationAccessKey : undefined,
        AWS_SECRET_ACCESS_KEY: config.destinationType === 's3' ? config.destinationSecretKey : undefined,
        B2_ACCOUNT_ID: config.destinationType === 'b2' ? config.destinationAccessKey : undefined,
        B2_ACCOUNT_KEY: config.destinationType === 'b2' ? config.destinationSecretKey : undefined,
    };
    const env = Object.entries(variables)
        .filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '')
        .map(([key, value]) => `${key}=${sh(value)}`).join(' ');
    const repository=getRepository(config);
    if(config.destinationType!=='sftp')return `${env ? env + ' ' : ''}restic -r ${sh(repository)}`;
    const peer=sftpPeer(repository);
    const publicKey=validateHostPublicKey(config.destinationHostPublicKey);
    if(!config.destinationSecretKey?.startsWith('-----'))
        throw new Error('Restic SFTP requires an SSH private key; password-only authentication is not supported');
    if(/[\u0000-\u0009\u000b-\u001f\u007f]/.test(config.destinationSecretKey))
        throw new Error('Invalid Restic SFTP private key');
    const privateKeyLiteral=`'${config.destinationSecretKey.replace(/'/g, `'\\''`)}'`;
    const sshCommandStart=[
        `sftp.command=ssh ${peer.target}`,'-p '+peer.port,'-o BatchMode=yes','-o StrictHostKeyChecking=yes',
        '-o IdentitiesOnly=yes','-o GlobalKnownHostsFile=/dev/null','-o'
    ].join(' ');
    const sftpCommand=`${sh(sshCommandStart+' ')}UserKnownHostsFile="$FORTRESS_TRUST_DIR/known_hosts"${sh(' -i ')}"$FORTRESS_TRUST_DIR/id_key"${sh(' -s sftp')}`;
    const keySetup=[
        'fortress_peer_cleanup() { rm -f -- "$FORTRESS_TRUST_DIR/known_hosts" "$FORTRESS_TRUST_DIR/id_key"; rmdir -- "$FORTRESS_TRUST_DIR"; }',
        `printf '%s' ${privateKeyLiteral} > "$FORTRESS_TRUST_DIR/id_key" || exit 1`,
        'chmod 600 "$FORTRESS_TRUST_DIR/id_key" || exit 1',
        ''
    ].join('\n');
    return trustFileSetup(hostKeyEntry(peer.host,peer.port,publicKey))+keySetup+
        `${env ? env + ' ' : ''}restic -r ${sh(repository)} -o ${sftpCommand}`;
};

const validSnapshot = (id: string): string => {
    if (!/^(?:latest|[0-9a-fA-F]{8,64})$/.test(id)) throw new Error('Invalid snapshot ID');
    return id;
};

export const buildResticCommand = (config: BackupJobConfig): string => {
    absoluteSources(config.sourcePaths);
    // Repository initialization is an explicit, separately verified operation.
    // In particular, NEVER swallow failures with restic init || true.
    const source = config.sourcePaths.map(sh).join(' ');
    return `${resticPrefix(config)} backup --one-file-system --exclude-caches --exclude=/proc --exclude=/sys --exclude=/dev -- ${source}`;
};

export const buildResticSnapshotListCommand = (config: BackupJobConfig): string =>
    `${resticPrefix(config)} snapshots --json`;

export const buildResticFileListCommand = (config: BackupJobConfig, snapshotId: string): string =>
    `${resticPrefix(config)} ls --json ${sh(validSnapshot(snapshotId))}`;

export const buildResticRestoreCommand = (
    config: BackupJobConfig, snapshotId: string, restorePath: string, paths?: string[]
): string => {
    absoluteRestorePath(restorePath);
    const includes = paths?.map(path => ` --include ${sh(path)}`).join('') || '';
    return `${resticPrefix(config)} restore ${sh(validSnapshot(snapshotId))} --target ${sh(restorePath)}${includes}`;
};
