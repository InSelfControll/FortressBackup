/**
 * Backup Executor Core - Class definition, SSH connection, command execution
 */

import { Client, ConnectConfig } from 'ssh2';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import { exec as execLocal } from 'child_process';
import { SSHConfig, BackupExecutionLog } from './types.js';

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
        const entry: BackupExecutionLog = {
            type,
            message,
            timestamp: new Date()
        };
        this.logs.push(entry);
        this.emit('log', entry);
    }

    async connect(config: SSHConfig): Promise<boolean> {
        if (this.isLocal) {
            this.log('info', 'Running in Local Mode (Fortress Server)');
            this.connected = true;
            return true;
        }

        return new Promise((resolve) => {
            this.log('info', `Connecting to ${config.username}@${config.host}:${config.port}...`);

            const connectConfig: ConnectConfig = {
                host: config.host,
                port: config.port,
                username: config.username,
                readyTimeout: 30000,
            };

            if (config.privateKey) {
                let keyContent = config.privateKey;

                if (!keyContent.startsWith('-----')) {
                    this.log('info', `Key does not start with standard header.First 10 chars: ${keyContent.substring(0, 10)}...`);

                    let keyPath = keyContent;
                    if (keyPath.startsWith('~')) {
                        keyPath = keyPath.replace('~', os.homedir());
                    }

                    try {
                        if (fs.existsSync(keyPath)) {
                            keyContent = fs.readFileSync(keyPath, 'utf8');
                        } else {
                            this.log('error', `SSH key invalid: Not a valid PEM / OpenSSH string and not a file on server.`);
                            resolve(false);
                            return;
                        }
                    } catch (err: any) {
                        this.log('error', `Failed to read SSH key: ${err.message} `);
                        resolve(false);
                        return;
                    }
                } else {
                    this.log('info', `Using ID_RSA / PEM key(Length: ${keyContent.length}).Header: ${keyContent.substring(0, 30)}...`);
                }

                connectConfig.privateKey = keyContent;
                if (config.passphrase) {
                    connectConfig.passphrase = config.passphrase;
                }
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

    async exec(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
        return new Promise((resolve, reject) => {
            this.log('info', `Executing: ${command.substring(0, 100)}${command.length > 100 ? '...' : ''}`);

            if (this.isLocal) {
                execLocal(command, (error, stdout, stderr) => {
                    if (stdout) {
                        stdout.split('\n').filter(Boolean).forEach(line => {
                            if (line.includes('%') || line.includes('MB') || line.includes('files')) {
                                this.log('progress', line.trim());
                            }
                        });
                    }
                    if (stderr) {
                        stderr.split('\n').filter(Boolean).forEach(line => {
                            this.log('error', line.trim());
                        });
                    }
                    resolve({
                        stdout,
                        stderr,
                        code: error ? (error.code || 1) : 0
                    });
                });
            } else {
                this.client.exec(command, (err, stream) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    let stdout = '';
                    let stderr = '';

                    stream.on('close', (code: number) => {
                        resolve({ stdout, stderr, code });
                    });

                    stream.on('data', (data: Buffer) => {
                        const text = data.toString();
                        stdout += text;
                        text.split('\n').filter(Boolean).forEach(line => {
                            if (line.includes('%') || line.includes('MB') || line.includes('files')) {
                                this.log('progress', line.trim());
                            }
                        });
                    });

                    stream.stderr.on('data', (data: Buffer) => {
                        const text = data.toString();
                        stderr += text;
                        text.split('\n').filter(Boolean).forEach(line => {
                            this.log('error', line.trim());
                        });
                    });
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
