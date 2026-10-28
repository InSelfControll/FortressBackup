/**
 * Backup Executor Core - Class definition, SSH connection, command execution
 */

import { Client, ConnectConfig } from 'ssh2';
import { sshHostVerifier } from '../ssh/hostKey.js';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import { spawn } from 'node:child_process';
import { SSHConfig, BackupExecutionLog } from './types.js';
import { maskSensitiveData } from '../../utils/maskSensitiveData.js';
import { appendBoundedJobLog } from '../../utils/boundedLog.js';

export class BackupExecutor extends EventEmitter {
    private client: Client;
    private logs: BackupExecutionLog[] = [];

    private connected: boolean = false;
    private isLocal: boolean = false;
    private errors: string[] = [];

    constructor(isLocal: boolean = false) {
        super();
        this.client = new Client();
        this.isLocal = isLocal;
    }

    getClient(): Client { return this.client; }
    getLogs(): BackupExecutionLog[] { return this.logs; }
    getErrors(): string[] { return this.errors; }
    isConnected(): boolean { return this.connected; }
    isLocalMode(): boolean { return this.isLocal; }
    setConnected(val: boolean) { this.connected = val; }
    addError(msg: string) { this.errors.push(msg); }

    log(type: BackupExecutionLog['type'], message: string) {
        // Mask any sensitive data (passwords, keys, tokens) before logging
        const maskedMessage = maskSensitiveData(message);
        const entry: BackupExecutionLog = {
            type,
            message: maskedMessage,
            timestamp: new Date()
        };
        appendBoundedJobLog(this.logs,entry);
        this.emit('log', entry);
    }

    async connect(config: SSHConfig): Promise<boolean> {
        if (this.isLocal) {
            this.log('info', 'Running in Local Mode (Fortress Server)');
            this.connected = true;
            return true;
        }

        let keyContent=config.privateKey;
        if (keyContent && !keyContent.startsWith('-----')) {
            const keyPath=keyContent.startsWith('~')?keyContent.replace(/^~/,os.homedir()):keyContent;
            const info=await fs.promises.lstat(keyPath);
            if(!info.isFile() || (info.mode & 0o077)!==0)
                throw new Error('SSH private key must be a regular file with owner-only permissions');
            keyContent=await fs.promises.readFile(keyPath,'utf8');
        }
        return new Promise((resolve) => {
            this.log('info', `Connecting to ${config.username}@${config.host}:${config.port}...`);

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
                this.log('success', 'SSH connection established');
                this.connected = true;
                resolve(true);
            });

            this.client.on('error', (err) => {
                this.log('error', `SSH connection failed: ${err.message} (${(err as any).code || 'Unknown code'})`);
                console.error('[SSH Error]', err);
                this.errors.push(err.message);
                this.connected = false;
                resolve(false);
            });

            this.client.connect(connectConfig);
        });
    }

    /**
     * Run a controlled shell script over stdin. Command bytes (including
     * credentials) are never part of argv, SSH exec requests, or log messages.
     * This is a compatibility bridge until fixed remote runners are deployed.
     */
    async exec(command: string): Promise<{stdout:string;stderr:string;code:number}> {
        if (!this.connected || command.length > 128 * 1024)
            throw new Error('Executor disconnected or script exceeds maximum size');
        this.log('info', 'Executing constrained backup operation');
        return new Promise((resolve,reject) => {
            let stdout='', stderr='', total=0, finished=false;
            let terminate:()=>void=()=>{};
            const timeout=setTimeout(()=>fail(new Error('Backup command timed out')), 6*60*60*1000);
            const fail=(error:Error)=>{
                if(finished)return;
                finished=true; clearTimeout(timeout); terminate(); reject(error);
            };
            const append=(kind:'stdout'|'stderr',chunk:Buffer)=>{
                if(finished)return;
                total+=chunk.length;
                if(total>8*1024*1024)return fail(new Error('Backup output exceeded 8MiB'));
                const value=chunk.toString('utf8');
                if(kind==='stdout')stdout+=value;else stderr+=value;
                // Limit log fan-out even when a remote job is verbose.
                if(this.logs.length<2000 && (value.includes('files') || value.includes('MB') || kind==='stderr'))
                    this.log(kind==='stderr'?'error':'progress',value.slice(0,2048));
            };
            const done=(code:number|null)=>{
                if(finished)return;
                finished=true;clearTimeout(timeout);
                resolve({stdout,stderr,code:typeof code==='number'?code:1});
            };
            if(this.isLocal){
                const child=spawn('/bin/sh',['-s'],{stdio:['pipe','pipe','pipe']});
                terminate=()=>child.kill('SIGKILL');
                child.on('error',fail);
                child.stdout.on('data',(chunk:Buffer)=>append('stdout',chunk));
                child.stderr.on('data',(chunk:Buffer)=>append('stderr',chunk));
                child.on('close',done);
                child.stdin.on('error',()=>{});
                child.stdin.end(command);
            }else{
                this.client.exec('sh -s',(error,stream)=>{
                    if(error)return fail(error);
                    terminate=()=>stream.close();
                    stream.on('data',(chunk:Buffer)=>append('stdout',chunk));
                    stream.stderr.on('data',(chunk:Buffer)=>append('stderr',chunk));
                    stream.on('close',done);
                    stream.on('error',fail);
                    stream.end(command);
                });
            }
        });
    }

    disconnect() {
        if (this.connected) {
            this.client.end();
            this.connected = false;
            this.log('info', 'SSH connection closed');
        }
    }
}
