/**
 * SSH Deployer Core
 */

import { Client, ConnectConfig } from 'ssh2';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import { SSHConnectionConfig, DeploymentLog, DeploymentResult, SSHExecutor, CommandResult } from './types.js';
import { detectOS, installBorg, installRestic, installRsync } from './tools.js';

export class SSHDeployer extends EventEmitter implements SSHExecutor {
    private client: Client;
    private logs: DeploymentLog[] = [];
    private connected: boolean = false;

    constructor() {
        super();
        this.client = new Client();
    }

    log(type: DeploymentLog['type'], message: string) {
        const entry: DeploymentLog = {
            type,
            message,
            timestamp: new Date()
        };
        this.logs.push(entry);
        this.emit('log', entry);
    }

    async connect(config: SSHConnectionConfig): Promise<boolean> {
        return new Promise((resolve) => {
            this.log('ssh', `Attempting connection to ${config.username}@${config.host}:${config.port}...`);

            const connectConfig: ConnectConfig = {
                host: config.host,
                port: config.port,
                username: config.username,
                readyTimeout: 30000,
            };

            if (config.privateKey) {
                let keyContent = config.privateKey;

                // Check if it's a file path (starts with / or ~ or doesn't start with -----)
                if (!keyContent.startsWith('-----')) {
                    // Expand ~ to home directory
                    let keyPath = keyContent;
                    if (keyPath.startsWith('~')) {
                        keyPath = keyPath.replace('~', os.homedir());
                    }

                    // Try to read the file
                    try {
                        if (fs.existsSync(keyPath)) {
                            this.log('info', `Reading SSH key from: ${keyPath}`);
                            keyContent = fs.readFileSync(keyPath, 'utf8');
                        } else {
                            this.log('error', `SSH key file not found: ${keyPath}`);
                            resolve(false);
                            return;
                        }
                    } catch (err: any) {
                        this.log('error', `Failed to read SSH key file: ${err.message}`);
                        resolve(false);
                        return;
                    }
                }

                connectConfig.privateKey = keyContent;
                if (config.passphrase) {
                    connectConfig.passphrase = config.passphrase;
                }
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
        if (!this.connected) {
            throw new Error('Not connected to SSH server');
        }

        return new Promise((resolve, reject) => {
            this.log('cmd', `Executing: ${command}`);

            this.client.exec(command, (err, stream) => {
                if (err) {
                    this.log('error', `Command execution failed: ${err.message}`);
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
                    // Stream output line by line
                    text.split('\n').filter(Boolean).forEach(line => {
                        this.log('progress', line);
                    });
                });

                stream.stderr.on('data', (data: Buffer) => {
                    const text = data.toString();
                    stderr += text;
                    text.split('\n').filter(Boolean).forEach(line => {
                        this.log('error', line);
                    });
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

            if (installedTools.length > 0) {
                this.log('success', `Deployment complete! Installed: ${installedTools.join(', ')}`);
                return {
                    success: true,
                    installedTools,
                    logs: this.logs
                };
            } else {
                this.log('error', 'No tools were installed');
                return {
                    success: false,
                    installedTools: [],
                    logs: this.logs,
                    error: 'Failed to install any backup tools'
                };
            }
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
