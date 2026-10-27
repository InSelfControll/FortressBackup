/**
 * SSH Deployer Core
 */

import { Client, ConnectConfig } from 'ssh2';
import { sshHostVerifier } from './hostKey.js';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import { SSHConnectionConfig, DeploymentLog, DeploymentResult, SSHExecutor, CommandResult } from './types.js';
import { detectOS, installBorg, installRestic, installRsync } from './tools.js';
import { maskSensitiveData } from '../../utils/maskSensitiveData.js';

export class SSHDeployer extends EventEmitter implements SSHExecutor {
    private client: Client;
    private logs: DeploymentLog[] = [];
    private connected: boolean = false;

    constructor() {
        super();
        this.client = new Client();
    }

    log(type: DeploymentLog['type'], message: string) {
        // Mask any sensitive data (passwords, keys, tokens) before logging
        const maskedMessage = maskSensitiveData(message);
        const entry: DeploymentLog = {
            type,
            message: maskedMessage,
            timestamp: new Date()
        };
        if (this.logs.length >= 2000) this.logs.shift();
        this.logs.push(entry);
        this.emit('log', entry);
    }

    async connect(config: SSHConnectionConfig): Promise<boolean> {
        let keyContent=config.privateKey;
        if (keyContent && !keyContent.startsWith('-----')) {
            const keyPath=keyContent.startsWith('~')?keyContent.replace(/^~/,os.homedir()):keyContent;
            const info=await fs.promises.lstat(keyPath);
            if(!info.isFile() || (info.mode & 0o077)!==0)
                throw new Error('SSH private key must be a regular file with owner-only permissions');
            keyContent=await fs.promises.readFile(keyPath,'utf8');
        }
        return new Promise((resolve) => {
            this.log('ssh', `Attempting connection to ${config.username}@${config.host}:${config.port}...`);

            const connectConfig: ConnectConfig = {
                host: config.host,
                port: config.port,
                username: config.username,
                readyTimeout: 30000,
                hostVerifier: sshHostVerifier(config.hostFingerprint),
            };

            // Credentials are resolved asynchronously before constructing the
            // connection. The SSH trust pin is checked by hostVerifier.
            if (keyContent) {
                connectConfig.privateKey = keyContent;
                if (config.passphrase) connectConfig.passphrase = config.passphrase;
            } else if (config.password) {
                connectConfig.password = config.password;
            }

            this.client.on('ready', () => {
                this.log('success', 'SSH connection established successfully');
                this.connected = true;
                resolve(true);
            });

            this.client.on('error', (err) => {
                this.log('error', `SSH connection failed: ${err.message}`);
                this.connected = false;
                resolve(false);
            });

            this.client.connect(connectConfig);
        });
    }

    async executeCommand(command: string): Promise<CommandResult> {
        if (!this.connected) throw new Error('Not connected to SSH server');
        if (typeof command!=='string' || command.length===0 || command.length>128*1024)
            throw new Error('Invalid remote command length');
        this.log('cmd','Executing approved tool deployment operation');
        return new Promise((resolve,reject)=>{
            let stdout='',stderr='',bytes=0,closed=false;
            const fail=(error:Error)=>{
                if(closed)return;
                closed=true;clearTimeout(timeout);reject(error);
            };
            const timeout=setTimeout(()=>fail(new Error('Remote installer timed out')),15*60*1000);
            this.client.exec(command,(err,stream)=>{
                if(err)return fail(err);
                const capture=(data:Buffer,kind:'stdout'|'stderr')=>{
                    if(closed)return;
                    bytes+=data.length;
                    if(bytes>8*1024*1024){
                        stream.close();
                        return fail(new Error('Remote installer output exceeded 8 MiB'));
                    }
                    const value=data.toString('utf8');
                    if(kind==='stdout')stdout+=value;else stderr+=value;
                    if(this.logs.length<2000)
                        for(const line of value.split('\n').filter(Boolean).slice(0,24))
                            this.log(kind==='stdout'?'progress':'error',line.slice(0,1024));
                };
                stream.on('data',(data:Buffer)=>capture(data,'stdout'));
                stream.stderr.on('data',(data:Buffer)=>capture(data,'stderr'));
                stream.on('error',fail);
                stream.on('close',(code:number)=>{
                    if(closed)return;
                    closed=true;clearTimeout(timeout);
                    resolve({stdout,stderr,code:typeof code==='number'?code:1});
                });
            });
        });
    }

    async deploy(selectedTools: string[] = ['borg', 'restic']): Promise<DeploymentResult> {
        const installedTools: string[] = [];

        try {
            // Detect OS
            const { distro, packageManager } = await detectOS(this);
            this.log('info', `Using ${packageManager} package manager`);
            this.log('info', `Tools to install: ${selectedTools.join(', ')}`);

            // Install selected tools only
            if (selectedTools.includes('borg')) {
                if (await installBorg(this, packageManager)) {
                    installedTools.push('borg');
                }
            }

            if (selectedTools.includes('restic')) {
                if (await installRestic(this)) {
                    installedTools.push('restic');
                }
            }

            if (selectedTools.includes('rsync')) {
                if (await installRsync(this, packageManager)) {
                    installedTools.push('rsync');
                }
            }

            // Guard: No tools installed
            if (installedTools.length === 0) {
                this.log('error', 'No tools were installed');
                return {
                    success: false,
                    installedTools: [],
                    logs: this.logs,
                    error: 'Failed to install any backup tools'
                };
            }

            // Happy Path: Deployment Complete
            this.log('success', `Deployment complete! Installed: ${installedTools.join(', ')}`);
            return {
                success: true,
                installedTools,
                logs: this.logs
            };

        } catch (err: any) {
            this.log('error', `Deployment failed: ${err.message}`);
            return {
                success: false,
                installedTools: [],
                logs: this.logs,
                error: err.message
            };
        }
    }

    disconnect() {
        if (this.connected) {
            this.client.end();
            this.connected = false;
            this.log('info', 'SSH connection closed');
        }
    }
}

export const deployToSystem = async (
    config: SSHConnectionConfig,
    selectedTools: string[] = ['borg', 'restic'],
    onLog?: (log: DeploymentLog) => void
): Promise<DeploymentResult> => {
    const deployer = new SSHDeployer();

    if (onLog) {
        deployer.on('log', onLog);
    }

    const connected = await deployer.connect(config);
    if (!connected) {
        return {
            success: false,
            installedTools: [],
            logs: [],
            error: 'Failed to connect to SSH server'
        };
    }

    const result = await deployer.deploy(selectedTools);
    deployer.disconnect();

    return result;
};
