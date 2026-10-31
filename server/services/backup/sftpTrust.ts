import type { BackupJobConfig } from './types.js';
import { hostKeyEntry, trustFileSetup } from './sshTrust.js';

/** Native SSH transport shared by Borg and Rsync; no ambient SSHFS credentials. */
export function sftpTransport(config: BackupJobConfig) {
    const url = new URL(config.destinationPath);
    const username = decodeURIComponent(url.username) || config.destinationAccessKey || '';
    const port = Number(url.port || 22);
    const remotePath = decodeURIComponent(url.pathname.slice(1)) || '.';
    if (url.protocol !== 'sftp:' || url.password || url.hash || url.search ||
        !/^[A-Za-z0-9._-]{1,120}$/.test(username) || !/^[A-Za-z0-9.-]{1,253}$/.test(url.hostname) ||
        !Number.isInteger(port) || port<1 || port>65535 || /[\u0000-\u001f\u007f]/.test(remotePath))
        throw new Error('Invalid SSH storage destination');
    const privateKey = config.destinationSecretKey?.replace(/\r\n/g,'\n').trimEnd();
    if (!privateKey?.startsWith('-----') || /[\u0000-\u0009\u000b-\u001f\u007f]/.test(privateKey))
        throw new Error('SSH storage requires the saved destination private key');
    const keyLiteral = "'"+privateKey.replace(/'/g,"'\\''")+"'";
    const setup = trustFileSetup(hostKeyEntry(url.hostname,port,config.destinationHostPublicKey)) + [
        'fortress_peer_cleanup() { rm -f -- "$FORTRESS_TRUST_DIR/known_hosts" "$FORTRESS_TRUST_DIR/id_key"; rmdir -- "$FORTRESS_TRUST_DIR"; }',
        `printf '%s\\n' ${keyLiteral} > "$FORTRESS_TRUST_DIR/id_key" || exit 1`,
        'chmod 600 "$FORTRESS_TRUST_DIR/id_key" || exit 1',
        `export FORTRESS_SSH_COMMAND="ssh -p ${port} -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -o GlobalKnownHostsFile=/dev/null -o UserKnownHostsFile=\\\"$FORTRESS_TRUST_DIR/known_hosts\\\" -i \\\"$FORTRESS_TRUST_DIR/id_key\\\""`,
        ''
    ].join('\n');
    const borgPath = remotePath.startsWith('/') ? remotePath : '/./'+remotePath;
    return {setup, target:username+'@'+url.hostname, path:remotePath, borgRepository:`ssh://${username}@${url.hostname}:${port}${borgPath}`};
}
