/**
 * Config Routes - Setup, public config, and key-value config store
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import * as db from '../db/index.js';
import { getJwtSecret, authenticateToken } from '../middleware/auth.js';
import { generateEnvFile } from '../utils/env.js';

const router = Router();

// Initial setup
router.post('/setup', async (req, res) => {
    try {
        const { aiConfig, dbConfig, ssoConfig, authMode, adminUser, selectedTools } = req.body;

        // Generate .env file
        const envPath = generateEnvFile({ dbConfig, aiConfig, ssoConfig, authMode });

        // Reload environment variables runtime
        dotenv.config({ override: true });

        await db.saveConfig('ai_config', aiConfig);
        await db.saveConfig('db_config', dbConfig);
        await db.saveConfig('sso_config', ssoConfig);
        await db.saveConfig('auth_mode', authMode);
        await db.saveConfig('selected_tools', selectedTools || ['borg', 'restic']);
        await db.saveConfig('setup_complete', true);

        // Create admin user if local auth mode
        let token = null;
        let user = null;

        if (authMode === 'local' && adminUser) {
            user = await db.createUser({
                email: adminUser.email,
                name: adminUser.name,
                avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(adminUser.name)}`,
                role: 'admin',
                auth_type: 'local'
            }, adminUser.password);

            token = jwt.sign({ id: user.id, email: user.email, role: user.role }, getJwtSecret(), { expiresIn: '7d' });
        }

        res.json({ success: true, user, token, envPath });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Public endpoint to get auth mode and SSO config for login page
router.get('/public', async (req, res) => {
    try {
        const authMode = await db.getConfig<string>('auth_mode');
        const ssoConfig = await db.getConfig<any>('sso_config');
        res.json({
            authMode: authMode || 'local',
            ssoConfig: ssoConfig ? {
                provider: ssoConfig.provider,
                clientId: ssoConfig.clientId, // Client ID is public, needed for OAuth redirect
                // Don't expose clientSecret
            } : null
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get config by key
router.get('/:key', authenticateToken, async (req, res) => {
    try {
        const value = await db.getConfig(req.params.key);
        res.json({ value });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Save config by key
router.put('/:key', authenticateToken, async (req, res) => {
    try {
        await db.saveConfig(req.params.key, req.body.value);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
