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
import { AsyncLocalStorage } from 'node:async_hooks';

interface BackupProcessContext {
    jobId: string;
    runEpoch: number;
    signal?:AbortSignal;
    stopUnconfirmed?:boolean;
}

interface RecordedProcessGroup {
    pgid: number;
    exited: Promise<void>;
    release: () => void;
}

const processContext = new AsyncLocalStorage<BackupProcessContext>();
const recordedProcessGroups = new Map<string, Set<RecordedProcessGroup>>();

const processRunKey = (jobId: string, runEpoch: number) => `${jobId}:${runEpoch}`;

const operationControllers=new Map<string,AbortController>();
export function cancelRecordedJob(jobId:string,epoch:number):boolean{
 const controller=operationControllers.get(processRunKey(jobId,epoch));controller?.abort();return !!controller;
}
export async function withBackupProcessContext<T>(context: BackupProcessContext, operation: () => T): Promise<Awaited<T>> {
 const controller=new AbortController(),key=processRunKey(context.jobId,context.runEpoch);
 const execution:BackupProcessContext={...context,signal:controller.signal};
 operationControllers.set(key,controller);
 const timer=setInterval(async()=>{
  try{const {getOne}=await import('../../db/helpers.js');const row=await getOne<{run_epoch:number;cancel_requested:number;status:string}>('SELECT run_epoch,cancel_requested,status FROM jobs WHERE id=?',[context.jobId]);
   if(row&&(row.cancel_requested||row.run_epoch!==context.runEpoch||row.status!=='Running'))controller.abort();
  }catch{/* A temporary database outage must not falsely cancel work. */}
 },1000);timer.unref?.();
 try{return await processContext.run(execution,operation)}
 finally{clearInterval(timer);if(operationControllers.get(key)===controller)operationControllers.delete(key);if(execution.stopUnconfirmed)throw Object.assign(new Error('Could not confirm the operation stopped; operator review is required'),{stopUnconfirmed:true})}
}


function recordProcessGroup(jobId: string, runEpoch: number, pgid: number): RecordedProcessGroup {
    const key = processRunKey(jobId, runEpoch);
    const groups = recordedProcessGroups.get(key) ?? new Set<RecordedProcessGroup>();
    let resolveExited!: () => void;
    const group: RecordedProcessGroup = {
        pgid,
        exited: new Promise<void>(resolve => { resolveExited = resolve; }),
        release: () => {
            groups.delete(group);
            if (groups.size === 0) recordedProcessGroups.delete(key);
            resolveExited();
        }
    };
    groups.add(group);
    recordedProcessGroups.set(key, groups);
    return group;
}

export async function reconcileRecordedProcessGroups(jobId: string, runEpoch: number): Promise<boolean> {
    const recorded = recordedProcessGroups.get(processRunKey(jobId, runEpoch));
    if (!recorded?.size) return false;

    const groups = [...recorded];
    let stopped = true;
    for (const group of groups) {
        try {
            process.kill(-group.pgid, 'SIGKILL');
        } catch (error: any) {
            if (error?.code !== 'ESRCH') stopped = false;
        }
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        const exited = await Promise.race([
            Promise.all(groups.map(group => group.exited)).then(() => true),
            new Promise<false>(resolve => { timeout = setTimeout(() => resolve(false), 5000); })
        ]);
        return stopped && exited;
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

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
    async exec(command: string, signal?: AbortSignal): Promise<{stdout:string;stderr:string;code:number}> {
        const executionContext=processContext.getStore();
        signal??=executionContext?.signal;
        if (!this.connected || command.length > 128 * 1024)
            throw new Error('Executor disconnected or script exceeds maximum size');
        this.log('info', 'Executing constrained backup operation');
        return new Promise((resolve,reject) => {
            let stdout='', stderr='', total=0, finished=false;
            let terminate:()=>Promise<void>=async()=>{};
            let releaseRecordedGroup:()=>void=()=>{};
            const onAbort=()=>fail(new Error('Backup command aborted'));
            const cleanup=()=>{
                clearTimeout(timeout);
                signal?.removeEventListener('abort',onAbort);
            };
            const timeout=setTimeout(()=>fail(new Error('Backup command timed out')), 6*60*60*1000);
            const fail=async(error:Error)=>{
                if(finished)return;
                finished=true;cleanup();
                try{await terminate()}catch{
                  const context=executionContext;if(context)context.stopUnconfirmed=true;
                  if(context){try{const {run}=await import('../../db/helpers.js');await run("UPDATE jobs SET status='ReviewRequired' WHERE id=? AND run_epoch=? AND status='Running'",[context.jobId,context.runEpoch])}catch{/* No confirmed stop: keep the operation unresolved. */}}
                  reject(new Error('Could not confirm the operation stopped; operator review is required'));return;
                }
                reject(error);
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
                releaseRecordedGroup();
                if(finished)return;
                finished=true;cleanup();
                resolve({stdout,stderr,code:typeof code==='number'?code:1});
            };
            if(signal?.aborted)return onAbort();
            signal?.addEventListener('abort',onAbort,{once:true});
            if(this.isLocal){
                const child=spawn('/bin/sh',['-s'],{
                    stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32'
                });
                const exited=new Promise<void>(resolve=>child.once('close',()=>resolve()));
                const context=executionContext;
                if(context && child.pid!==undefined && process.platform!=='win32'){
                    const recorded=recordProcessGroup(context.jobId,context.runEpoch,child.pid);
                    releaseRecordedGroup=recorded.release;
                }
                terminate=async()=>{
                    if(child.pid===undefined)return;
                    if(process.platform==='win32'){
                        spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore'}).on('error',()=>{});
                        return;
                    }
                    try { process.kill(-child.pid,'SIGKILL'); }
                    catch { child.kill('SIGKILL'); }
                    let limit:ReturnType<typeof setTimeout>|undefined;
                    try{await Promise.race([exited,new Promise<void>((_,reject)=>{limit=setTimeout(()=>reject(new Error('Local stop confirmation timed out')),5000)})])}finally{if(limit)clearTimeout(limit)}
                };
                child.on('error',fail);
                child.stdout.on('data',(chunk:Buffer)=>append('stdout',chunk));
                child.stderr.on('data',(chunk:Buffer)=>append('stderr',chunk));
                child.on('close',done);
                child.stdin.on('error',()=>{});
                child.stdin.end(command);
            }else{
                // A separate process group lets cancellation stop Restic and its SSH descendants.
                this.client.exec(`setsid -w sh -c 'printf "FORTRESS_PROCESS_GROUP:%s\\n" "$$"; IFS= read -r allow; [ "$allow" = run ] && exec sh -s'`,(error,stream)=>{
                    if(error)return void fail(error);
                    if(finished){stream.close();return}
                    let pgid:number|undefined,header='';
                    const stopped=()=>new Promise<void>((resolve,rejectStop)=>{
                        if(!pgid){stream.close();resolve();return}
                        const target=pgid;
                        if(target<=1){rejectStop(new Error('Invalid remote process group'));return}
                        this.client.exec(`kill -TERM -${target} 2>/dev/null; n=0; while kill -0 -${target} 2>/dev/null && [ "$n" -lt 20 ]; do n=$((n+1)); sleep 0.1; done; kill -9 -${target} 2>/dev/null; n=0; while kill -0 -${target} 2>/dev/null && [ "$n" -lt 20 ]; do n=$((n+1)); sleep 0.1; done; if ! kill -0 -${target} 2>/dev/null; then exit 0; fi; state=$(ps -eo pgid=,stat=) || exit 2; printf '%s\\n' "$state" | awk '$1==${target} && $2 !~ /^Z/ {alive=1} END {exit alive?1:0}'`,(err,control)=>{
                            if(err){rejectStop(err);return}
                            const limit=setTimeout(()=>{control.close();rejectStop(new Error('Stop confirmation timed out'))},7000);
                            control.on('data',()=>{});control.stderr.on('data',()=>{});
                            control.on('error',error=>{clearTimeout(limit);rejectStop(error)});
                            control.on('close',(code:number)=>{clearTimeout(limit);if(code===0)resolve();else rejectStop(new Error('Remote process group is still active'))});
                        });
                    });
                    terminate=stopped;
                    stream.on('data',(chunk:Buffer)=>{
                        if(pgid!==undefined){append('stdout',chunk);return}
                        header+=chunk.toString('utf8');const newline=header.indexOf('\n');
                        if(newline<0){if(header.length>128)void fail(new Error('Invalid remote process identity'));return}
                        const match=/^FORTRESS_PROCESS_GROUP:([1-9][0-9]{0,9})$/.exec(header.slice(0,newline));
                        if(!match){void fail(new Error('Remote process identity missing'));return}
                        pgid=Number(match[1]);append('stdout',Buffer.from(header.slice(newline+1)));header='';if(!finished)stream.end('run\n'+command);
                    });
                    stream.stderr.on('data',(chunk:Buffer)=>append('stderr',chunk));
                    stream.on('close',done);stream.on('error',error=>void fail(error));

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
