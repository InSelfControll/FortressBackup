/**
 * Config Routes - Setup, public config, and key-value config store
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import * as db from '../db/index.js';
import { getJwtSecret, authenticateToken, requireAdmin } from '../middleware/auth.js';
import { generateEnvFile } from '../utils/env.js';

const router = Router();

// Initial setup
router.post('/setup', async (req, res) => {
    try {
        if (!db.isInitialized()) return res.status(503).json({ error: 'Database must be initialized before setup' });
        if ((await db.getConfig<boolean>('setup_complete')) || await db.hasUsers()) {
            return res.status(409).json({ error: 'Setup already completed' });
        }
        const expectedToken=process.env.FORTRESS_BOOTSTRAP_TOKEN;
        const supplied=req.get('x-fortress-bootstrap-token') || '';
        if (!expectedToken || expectedToken.length < 32)
            return res.status(503).json({error:'Configure FORTRESS_BOOTSTRAP_TOKEN to complete first-run setup'});
        const expected=crypto.createHash('sha256').update(expectedToken).digest();
        const received=crypto.createHash('sha256').update(supplied).digest();
        if(!supplied || !crypto.timingSafeEqual(expected,received))
            return res.status(401).json({error:'Invalid bootstrap token'});
        const { aiConfig, dbConfig, ssoConfig, authMode, adminUser, selectedTools } = req.body || {};
        const invalidTools = selectedTools !== undefined && (
            !Array.isArray(selectedTools) ||
            selectedTools.some((item: unknown) => !['borg','restic','rsync'].includes(String(item)))
        );
        const invalidAdmin = authMode === 'local' && (
            !adminUser || typeof adminUser.name !== 'string' ||
            typeof adminUser.email !== 'string' ||
            typeof adminUser.password !== 'string' || adminUser.password.length < 12
        );
        if (!dbConfig || !['SQLite','sqlite','PostgreSQL','postgres'].includes(dbConfig.type) ||
            !ssoConfig || !aiConfig || !['local','sso'].includes(authMode) || invalidAdmin || invalidTools)
            return res.status(400).json({error:'Invalid setup configuration'});
        // Claim first-run provisioning atomically to prevent concurrent setup.
        const claim=await db.getOne<{key:string}>(
            "INSERT INTO config(key,value) VALUES('bootstrap_claim',?) ON CONFLICT(key) DO NOTHING RETURNING key",
            [JSON.stringify(new Date().toISOString())]);
        if(!claim)return res.status(409).json({error:'Initial setup already claimed'});

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
router.get('/:key', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (req.params.key.startsWith('managed_agent_')) return res.status(403).json({error:'Managed agent records are not accessible through generic config API'});
        const value = await db.getConfig(req.params.key);
        res.json({ value });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Save config by key
router.put('/:key', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (req.params.key.startsWith('managed_agent_')) return res.status(403).json({error:'Managed agent records must use dedicated API'});
        await db.saveConfig(req.params.key, req.body.value);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
