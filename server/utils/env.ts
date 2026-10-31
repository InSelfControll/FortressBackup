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

    const envPath = process.env.FORTRESS_ENV_PATH || path.join(process.cwd(), 'data', '.env');
    const legacyPath = path.join(process.cwd(), '.env');
    const priorEnvPath = fs.existsSync(envPath) ? envPath : legacyPath;
    let jwtSecret = `${crypto.randomUUID()}-${crypto.randomUUID()}`;

    let credentialKey = crypto.randomBytes(32).toString('hex');
    // Preserve existing secret if available to prevent token invalidation
    if (fs.existsSync(priorEnvPath)) {
        const existingContent = fs.readFileSync(priorEnvPath, 'utf8');
        const match = existingContent.match(/JWT_SECRET=(.+)/);
        if (match && match[1]) {
            jwtSecret = match[1].trim();
        }
        const oldKey=existingContent.match(/^FORTRESS_CREDENTIAL_KEY=([0-9a-fA-F]{64})$/m);
        if (oldKey) credentialKey=oldKey[1];
    }

    const lines: string[] = [
        '# Fortress Backup Manager - Auto-generated Configuration',
        `# Generated at: ${new Date().toISOString()}`,
        '',
        '# Server',
        `PORT=${port}`,
        `JWT_SECRET=${jwtSecret}`,
        `FORTRESS_CREDENTIAL_KEY=${credentialKey}`,
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
        lines.push('PG_SSLMODE=verify-full');
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

    // Escape every supplied value and reject record injection before writing .env.
    const envContent = lines.map(line => {
        if (!line || line.startsWith('#')) return line;
        const at=line.indexOf('=');
        if (at <= 0) throw new Error('Invalid environment record');
        const name=line.slice(0,at), value=line.slice(at+1);
        if (/[\r\n\0]/.test(value) || value.length > 4096)
            throw new Error('Unsafe environment setting');
        if (name==='JWT_SECRET' || name==='FORTRESS_CREDENTIAL_KEY') return line;
        return name + '=' + JSON.stringify(value);
    }).join('\n');

    // Persist keys on the volume; never write partially to the active env file.
    fs.mkdirSync(path.dirname(envPath), {recursive:true,mode:0o700});
    const temporary = `${envPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, envContent, { encoding: 'utf-8', mode: 0o600, flag:'wx' });
    fs.renameSync(temporary, envPath);
    fs.chmodSync(envPath, 0o600);
    console.log(`[Fortress] Generated .env file at: ${envPath}`);

    return envPath;
};
