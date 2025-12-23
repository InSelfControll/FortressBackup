/**
 * SSH Deployment Service Types
 */

export interface DeploymentLog {
    type: 'info' | 'success' | 'error' | 'progress' | 'ssh' | 'cmd';
    message: string;
    timestamp: Date;
}

export interface DeploymentResult {
    success: boolean;
    installedTools: string[];
    logs: DeploymentLog[];
    error?: string;
}

export interface SSHConnectionConfig {
    host: string;
    port: number;
    username: string;
    privateKey?: string;
    passphrase?: string;
    password?: string;
}

export interface CommandResult {
    stdout: string;
    stderr: string;
    code: number;
}

export interface SSHExecutor {
    executeCommand(command: string): Promise<CommandResult>;
    log(type: DeploymentLog['type'], message: string): void;
}
