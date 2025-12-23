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
import jobsRouter from './routes/jobs.js';
import sshKeysRouter from './routes/sshKeys.js';

// Initialize environment
const envPath = path.join(process.cwd(), '.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.warn('[Fortress] Warning: .env file not found or could not be loaded');
} else {
    console.log('[Fortress] Environment loaded successfully');
}

const app = express();
const PORT = process.env.PORT || 9001;

// Middleware
app.use(cors());
app.use(express.json());

// ==================== ROUTES ====================

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// System Status
app.get('/api/status', async (req, res) => {
    try {
        const setupComplete = await db.getConfig<boolean>('setup_complete');
        const hasExistingUsers = await db.hasUsers();

        res.json({
            setupComplete: setupComplete || false,
            hasUsers: hasExistingUsers,
            dbType: process.env.DB_TYPE || 'sqlite'
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
app.use('/api/keys', sshKeysRouter);

// ==================== INITIALIZE & START ====================

const initialize = async () => {
    const dbType = (process.env.DB_TYPE || 'sqlite') as 'sqlite' | 'postgres';

    await db.initDatabase({
        type: dbType,
        filePath: process.env.SQLITE_PATH || './data/fortress.db',
        host: process.env.PG_HOST,
        port: parseInt(process.env.PG_PORT || '5432'),
        database: process.env.PG_DATABASE,
        username: process.env.PG_USER,
        password: process.env.PG_PASSWORD
    });

    app.listen(PORT, () => {
        console.log(`[Fortress API] Server running on port ${PORT}`);
        console.log(`[Fortress API] Database: ${dbType}`);
    });
};

initialize().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('[Fortress API] Shutting down...');
    await db.closeDatabase();
    process.exit(0);
});
