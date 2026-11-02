import { Client } from 'ssh2';
import { sshHostVerifier, hostFingerprintFromPublicKey } from './ssh/hostKey.js';
import type { SSHConnectionConfig } from './ssh/types.js';
import type { Location } from '../db/locations.js';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {azureRepository,driveConfig} from './backup/cloudStorage.js';

/** Storage-only read probe: no initialization, repository password or backup lease. */
export async function checkCloudLocation(location:Location):Promise<void>{
    const directory=await mkdtemp(join(tmpdir(),'fortress-cloud-check-'));
    try{
        const env={...process.env,RCLONE_CONFIG:join(directory,'rclone.conf')};
        let target:string;
        if(location.type==='gdrive'){
            await writeFile(env.RCLONE_CONFIG,driveConfig(location.path,location.secret_key),{mode:0o600});
            target=location.path;
        }else if(location.type==='azure'){
            azureRepository({destinationPath:location.path,destinationRegion:location.region,destinationAccessKey:location.access_key,destinationSecretKey:location.secret_key});
            Object.assign(env,{RCLONE_AZUREBLOB_ACCOUNT:location.access_key,RCLONE_AZUREBLOB_KEY:location.secret_key});
            target=`:azureblob:${location.path}/${location.region||''}`;
        }else throw new Error('Unsupported cloud connection test');
        await new Promise<void>((resolve,reject)=>{
            const child=spawn('rclone',['lsf',target,'--max-depth','1','--retries','1','--low-level-retries','1','--contimeout','8s','--timeout','15s'],{env,stdio:'ignore'});
            const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Cloud connection check timed out'))},25000);
            child.once('error',()=>{clearTimeout(timer);reject(new Error('Rclone is unavailable on the controller. Install it or update the controller image'))});
            child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('Cloud authentication or folder access failed. Check the saved account credentials, remote name, and folder permissions'))});
        });
    }finally{await rm(directory,{recursive:true,force:true})}
}

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
