/**
 * Environment File Generator Utility
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface EnvConfig {
    dbConfig: any;
    aiConfig: any;
    ssoConfig: any;
    authMode: string;
}

export const generateEnvFile = (config: EnvConfig, port: number = 9001) => {
    const { dbConfig, aiConfig, ssoConfig, authMode } = config;

    const envPath = path.join(process.cwd(), '.env');
    let jwtSecret = `${crypto.randomUUID()}-${crypto.randomUUID()}`;

    // Preserve existing secret if available to prevent token invalidation
    if (fs.existsSync(envPath)) {
        const existingContent = fs.readFileSync(envPath, 'utf8');
        const match = existingContent.match(/JWT_SECRET=(.+)/);
        if (match && match[1]) {
            jwtSecret = match[1].trim();
        }
    }

    const lines: string[] = [
        '# Fortress Backup Manager - Auto-generated Configuration',
        `# Generated at: ${new Date().toISOString()}`,
        '',
        '# Server',
        `PORT=${port}`,
        `JWT_SECRET=${jwtSecret}`,
        '',
        '# Database',
    ];

    if (dbConfig.type === 'sqlite' || dbConfig.type === 'SQLite') {
        lines.push('DB_TYPE=sqlite');
        lines.push(`SQLITE_PATH=${dbConfig.filePath || './data/fortress.db'}`);
    } else {
        lines.push('DB_TYPE=postgres');
        lines.push(`PG_HOST=${dbConfig.host || 'localhost'}`);
        lines.push(`PG_PORT=${dbConfig.port || 5432}`);
        lines.push(`PG_DATABASE=${dbConfig.database || 'fortress'}`);
        lines.push(`PG_USER=${dbConfig.username || 'postgres'}`);
        lines.push(`PG_PASSWORD=${dbConfig.password || ''}`);
    }

    lines.push('');
    lines.push('# Authentication');
    lines.push(`AUTH_MODE=${authMode}`);

    if (authMode === 'sso' && ssoConfig.provider) {
        lines.push(`SSO_PROVIDER=${ssoConfig.provider}`);
        if (ssoConfig.clientId) lines.push(`SSO_CLIENT_ID=${ssoConfig.clientId}`);
        if (ssoConfig.clientSecret) lines.push(`SSO_CLIENT_SECRET=${ssoConfig.clientSecret}`);
        if (ssoConfig.discoveryUrl) lines.push(`SSO_DISCOVERY_URL=${ssoConfig.discoveryUrl}`);
    }

    lines.push('');
    lines.push('# AI Configuration');
    if (aiConfig.provider && aiConfig.provider !== 'None') {
        lines.push(`AI_PROVIDER=${aiConfig.provider}`);
        if (aiConfig.apiKey) lines.push(`AI_API_KEY=${aiConfig.apiKey}`);
        if (aiConfig.baseUrl) lines.push(`AI_BASE_URL=${aiConfig.baseUrl}`);
        if (aiConfig.model) lines.push(`AI_MODEL=${aiConfig.model}`);
    }

    lines.push('');
    lines.push('# Frontend');
    lines.push('FRONTEND_URL=http://localhost:3001');

    const envContent = lines.join('\n');

    // Write to envPath
    fs.writeFileSync(envPath, envContent, 'utf-8');
    console.log(`[Fortress] Generated .env file at: ${envPath}`);

    return envPath;
};
