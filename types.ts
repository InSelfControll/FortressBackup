
export enum BackupTool {
  BORG = 'BorgBackup',
  RESTIC = 'Restic',
  RSYNC = 'Rsync',
  RCLONE = 'Rclone'
}

export enum JobStatus {
  IDLE = 'Idle',
  RUNNING = 'Running',
  SUCCESS = 'Success',
  FAILED = 'Failed',
  REVIEW_REQUIRED = 'ReviewRequired',
  WARNING = 'Warning'
}

export enum JobPriority {
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low'
}

export enum AIProvider {
  NONE = 'None',
  GEMINI = 'Gemini',
  OPENAI = 'OpenAI Compatible'
}

export enum DatabaseType {
  SQLITE = 'SQLite',
  POSTGRES = 'PostgreSQL'
}

export interface DatabaseConfig {
  type: DatabaseType;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}

export interface SSOConfig {
  provider: 'google' | 'github' | 'oidc' | null;
  clientId?: string;
  clientSecret?: string;
  discoveryUrl?: string;
}

export interface AIConfig {
  provider: AIProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface RetentionPolicy {
  keepHourly: number;
  keepDaily: number;
  keepWeekly: number;
  keepMonthly: number;
  keepYearly: number;
}

export interface EncryptedData {
  ciphertext: string;
  iv: string;
}

export interface SSHKey {
  id: string;
  name: string;
  privateKeyPath: string | EncryptedData;
  passphrase?: string | EncryptedData;
  createdAt: string;
  expiryDate?: string;
  order: number;
  isEncrypted: boolean;
}

export interface System {
  id: string;
  name: string;
  host: string;
  username?: string;
  port?: number;
  type: 'local' | 'remote';
  status: 'online' | 'offline';
  lastSeen: string;
  health: number;
  installedTools?: BackupTool[];
  sshKeyId?: string;
  hostPublicKey?: string;
  hostFingerprint?: string;
}

export interface Location {
  id: string;
  name: string;
  type: 's3' | 'sftp' | 'nfs' | 'b2' | 'gcs' | 'azure' | 'gdrive' | 'onedrive';
  path: string;
  endpoint?: string; // For S3 compatible
  region?: string;
  accessKey?: string;
  secretKey?: string;
  hostPublicKey?: string;
  hasAccessKey?: boolean;
  hasSecretKey?: boolean;
}

export type ManagedOperation = 'backup' | 'check' | 'snapshots' | 'files' | 'restore';
export interface ManagedRequest {snapshotId?:string;directory?:string;offset?:number;paths?:string[]}
export interface ManagedFile {path:string;name:string;type:'file'|'dir'|'symlink';size?:number}
export interface ManagedResult {snapshots?:Snapshot[];entries?:ManagedFile[];directory?:string;offset?:number;hasMore?:boolean;restorePath?:string;snapshotId?:string}
export interface ManagedAgentJob {
  id: string;
  operation: ManagedOperation;
  state: 'pending' | 'running' | 'success' | 'failed';
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  message?: string | null;
  hasResult?: boolean;
  result?: ManagedResult | null;
  request?: ManagedRequest | null;
}

export interface ManagedAgent {
  id: string;
  name: string;
  createdAt: string;
  lastSeen?: string | null;
  disabled: boolean;
  scheduleMinutes?: number;
  nextRunAt?: string | null;
  repositoryJobId?: string | null;
  repositoryName?: string | null;
  storageName?: string | null;
  capabilities?: string[];
  jobs: ManagedAgentJob[];
}

export interface BackupJob {
  id: string;
  name: string;
  tool: BackupTool;
  sourceId: string;
  sourcePaths: string[];
  destinationId: string;
  schedule: string;
  scheduleEnabled?: boolean;
  retention: RetentionPolicy;
  priority: JobPriority;
  repoPassword?: string;
  hasRepoPassword?: boolean;
  lastRun?: string;
  status: JobStatus;
  operation?: 'backup' | 'restore';
  operationAt?: string;
  nextRun: string;
  size?: string;
  stats?: {
    speed: number;
    dedupeRatio: number;
    filesProcessed: number;
  }
}

export interface Snapshot {
  id: string;
  shortId: string;
  time: string;
  paths: string[];
  hostname: string;
  username?: string;
  tags?: string[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: 'admin' | 'viewer';
  setupComplete?: boolean;
}

export type View = 'dashboard' | 'jobs' | 'systems' | 'managed-clients' | 'locations' | 'settings' | 'setup';
