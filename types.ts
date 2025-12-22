
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
  // Encrypted fields
  privateKeyPath: string | EncryptedData;
  passphrase?: string | EncryptedData;
  // Metadata
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
  health: number; // 0 to 100
}

export interface Location {
  id: string;
  name: string;
  type: 's3' | 'sftp' | 'local' | 'b2';
  path: string;
}

export interface BackupJob {
  id: string;
  name: string;
  tool: BackupTool;
  sourceId: string;
  destinationId: string;
  schedule: string; // Cron expression
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
