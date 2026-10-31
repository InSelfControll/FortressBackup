import { Client } from 'ssh2';
import { sshHostVerifier, hostFingerprintFromPublicKey } from './ssh/hostKey.js';
import type { SSHConnectionConfig } from './ssh/types.js';
import type { Location } from '../db/locations.js';

/** Read-only probes with pinned host identity; never install tools or create repositories. */
export function checkSSH(config: SSHConnectionConfig, remotePath?: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const client = new Client();
        let finished = false;
        const finish = (error?: Error) => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            client.end();
            error ? reject(error) : resolve();
        };
        const timeout = setTimeout(() => finish(new Error('SSH connection check timed out')), 12_000);
        client.on('error', error => finish(error));
        client.on('close', () => { if (!finished) finish(new Error('SSH connection closed before verification completed')); });
        client.on('ready', () => {
            if (remotePath === undefined) return finish();
            client.sftp((error, sftp) => {
                if (error) return finish(error);
                sftp.stat(remotePath, (error, stats) => {
                    if (error) return finish(new Error('SFTP login succeeded, but the repository directory could not be accessed. Create or initialize that directory first.'));
                    finish(stats.isDirectory() ? undefined : new Error('The SFTP destination must be a directory'));
                });
            });
        });
        try {
            client.connect({ ...config, hostVerifier: sshHostVerifier(config.hostFingerprint), readyTimeout: 10_000 });
        } catch (error) { finish(error instanceof Error ? error : new Error('Invalid SSH connection configuration')); }
    });
}

export async function checkSFTPLocation(location: Location): Promise<void> {
    const url = new URL(location.path);
    if (url.protocol !== 'sftp:' || url.password || !url.hostname || url.search || url.hash) throw new Error('Invalid SFTP repository URL');
    if (!location.host_public_key) throw new Error('Enroll the Storage Box host public key before testing');
    if (!location.secret_key?.startsWith('-----')) throw new Error('An SSH private key is required for SFTP authentication');
    const port = Number(url.port || 22);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SSH port');
    // Restic URL paths with one slash are relative to the SSH user's home.
    const remotePath = decodeURIComponent(url.pathname.slice(1)) || '.';
    if (/[\u0000-\u001f\u007f]/.test(remotePath)) throw new Error('Invalid SFTP repository path');
    await checkSSH({
        host: url.hostname, port, username: decodeURIComponent(url.username) || location.access_key || '',
        privateKey: location.secret_key, hostFingerprint: hostFingerprintFromPublicKey(location.host_public_key),
    }, remotePath);
}
