/**
 * Fortress Backend Server
 * Express API for database operations and authentication
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Import database
import * as db from './db/index.js';

// Import routers
import authRouter from './routes/auth.js';
import configRouter from './routes/config.js';
import systemsRouter from './routes/systems.js';
import locationsRouter from './routes/locations.js';
import jobsRouter, { recoverInterruptedRuns, dispatchScheduledJobs } from './routes/jobs.js';
import managedAgentsRouter, { dispatchScheduledManagedJobs } from './routes/managedAgents.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import sshKeysRouter from './routes/sshKeys.js';
import aiRouter from './routes/ai.js';
import { reconcileRecordedProcessGroups } from './services/backup/core.js';

// Initialize environment
const durableEnv = process.env.FORTRESS_ENV_PATH || path.join(process.cwd(), 'data', '.env');
const legacyEnv = path.join(process.cwd(), '.env');
const envPath = fs.existsSync(durableEnv) ? durableEnv : legacyEnv;
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.warn('[Fortress] Warning: .env file not found or could not be loaded');
} else {
    console.log('[Fortress] Environment loaded successfully');
}

const app = express();
const proxyTrust=process.env.TRUST_PROXY?.trim();
app.set('trust proxy', proxyTrust==='1'?1:(!proxyTrust||proxyTrust==='0'||proxyTrust==='false'?false:proxyTrust));
const PORT = process.env.PORT || 9001;

// Middleware
const allowedFrontend = process.env.FRONTEND_URL || 'http://localhost:3001';
app.use(securityHeaders);
app.use(cors({origin:(origin, callback) => callback(null, !origin || origin === allowedFrontend)}));
app.use(express.json());

// ==================== ROUTES ====================

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// System Status - works even before database is initialized
app.get('/api/status', async (req, res) => {
    try {
        // If database not initialized yet, return setup-needed status
        if (!db.isInitialized()) {
            return res.json({
                setupComplete: false,
                hasUsers: false,
                dbType: process.env.DB_TYPE || 'sqlite',
                dbInitialized: false
            });
        }

        const setupComplete = await db.getConfig<boolean>('setup_complete');
        const hasExistingUsers = await db.hasUsers();

        res.json({
            setupComplete: setupComplete || false,
            hasUsers: hasExistingUsers,
            dbType: process.env.DB_TYPE || 'sqlite',
            dbInitialized: true
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/config', configRouter);
app.use('/api/systems', systemsRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/managed-agents', managedAgentsRouter);
app.use('/api/keys', sshKeysRouter);
app.use('/api/ai', aiRouter);

// ==================== STATIC FILES (PRODUCTION) ====================

const distPath = path.join(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
    console.log(`[Fortress] Serving static files from: ${distPath}`);
    app.use(express.static(distPath));

    // Handle SPA routing - send all non-API requests to index.html
    app.get(/.*/, (req, res, next) => {
        if (req.path.startsWith('/api')) {
            return next();
        }
        res.sendFile(path.join(distPath, 'index.html'));
    });
} else {
    console.warn('[Fortress] Warning: dist folder not found. Static files will not be served.');
}

// ==================== INITIALIZE & START ====================

const initialize = async () => {
    const dbType = (process.env.DB_TYPE || 'sqlite') as 'sqlite' | 'postgres';

    // Start server first - always available for health checks and setup page
    app.listen(PORT, () => {
        console.log(`[Fortress API] Server running on port ${PORT}`);
    });

    // Try to initialize database (may fail if data dir not writable - that's OK)
    try {
        await db.initDatabase({
            type: dbType,
            filePath: process.env.SQLITE_PATH || './data/fortress.db',
            host: process.env.PG_HOST,
            port: parseInt(process.env.PG_PORT || '5432'),
            database: process.env.PG_DATABASE,
            username: process.env.PG_USER,
            password: process.env.PG_PASSWORD
        });
        await recoverInterruptedRuns();
        console.log(`[Fortress API] Database: ${dbType}`);
        setInterval(() => void dispatchScheduledJobs().catch(error => console.error('[SSH Jobs] Scheduler failed:', error)), 60_000);
        setInterval(() => void dispatchScheduledManagedJobs().catch(error => console.error('[Managed Agents] Scheduler failed:', error)), 60_000);
    } catch (error: any) {
        console.warn(`[Fortress API] Database not initialized: ${error.message}`);
        console.warn('[Fortress API] Complete setup via browser to configure database');
    }
};

initialize();

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('[Fortress API] Shutting down...');
    if (db.isInitialized()) {
        const activeRuns = await db.query<{id: string; run_epoch: number}>(
            `SELECT id,run_epoch FROM jobs WHERE status='Running'`
        );
        await Promise.all(activeRuns.map(run => reconcileRecordedProcessGroups(run.id, run.run_epoch)));
    }
    await db.closeDatabase();
    process.exit(0);
});
