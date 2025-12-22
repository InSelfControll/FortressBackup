
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
}

export interface Location {
  id: string;
  name: string;
  type: 's3' | 'sftp' | 'local' | 'b2';
  path: string;
  endpoint?: string; // For S3 compatible
  region?: string;
  accessKey?: string;
  secretKey?: string;
}

export interface BackupJob {
  id: string;
  name: string;
  tool: BackupTool;
  sourceId: string;
  destinationId: string;
  schedule: string;
  retention: RetentionPolicy;
  priority: JobPriority;
  lastRun?: string;
  status: JobStatus;
  nextRun: string;
  size?: string;
  stats?: {
    speed: number;
    dedupeRatio: number;
    filesProcessed: number;
  }
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: 'admin' | 'viewer';
  setupComplete?: boolean;
}

export type View = 'dashboard' | 'jobs' | 'systems' | 'locations' | 'settings' | 'setup';
