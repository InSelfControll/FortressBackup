/**
 * Database Types
 */

export type DatabaseType = 'sqlite' | 'postgres';

export interface DatabaseConfig {
    type: DatabaseType;
    // SQLite
    filePath?: string;
    // PostgreSQL
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
}
