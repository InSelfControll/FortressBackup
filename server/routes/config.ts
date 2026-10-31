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
const editableKeys=new Set(['ai_config','db_config','sso_config','auth_mode','selected_tools']);
const hideSecrets=(value:any):any=>{
    if(Array.isArray(value))return value.map(hideSecrets);
    if(value && typeof value==='object'){
        return Object.fromEntries(Object.entries(value)
            .filter(([key])=>!/password|secret|token|apiKey|accessKey|privateKey|credential/i.test(key))
            .map(([key,item])=>[key,hideSecrets(item)]));
    }
    return value;
};

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
            !adminUser || typeof adminUser.name !== 'string' || !adminUser.name.trim() || adminUser.name.length > 120 ||
            typeof adminUser.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminUser.email) || adminUser.email.length > 254 ||
            typeof adminUser.password !== 'string' || adminUser.password.length < 12 || adminUser.password.length > 256
        );
        if (!dbConfig || !['SQLite','sqlite','PostgreSQL','postgres'].includes(dbConfig.type) ||
            !ssoConfig || !aiConfig || !['local','sso'].includes(authMode) || invalidAdmin || invalidTools)
            return res.status(400).json({error:'Invalid setup configuration'});
        if (authMode === 'sso' && (ssoConfig.provider !== 'github' || !ssoConfig.clientId || !ssoConfig.clientSecret)) return res.status(400).json({error:'GitHub is the supported SSO provider; its client ID and secret are required'});
        const active = db.currentConfig;
        const requestedType = ['sqlite','SQLite'].includes(dbConfig.type) ? 'sqlite' : 'postgres';
        if (requestedType !== active?.type) return res.status(400).json({error:'The selected database does not match the running controller. Configure the database environment and restart before setup.'});
        const activeDbConfig = active.type === 'sqlite'
            ? {type:'SQLite',filePath:active.filePath || './data/fortress.db'}
            : {type:'PostgreSQL',host:active.host,port:active.port,database:active.database,username:active.username,password:active.password};
        // Claim first-run provisioning atomically to prevent concurrent setup.
        const claim=await db.getOne<{key:string}>(
            "INSERT INTO config(key,value) VALUES('bootstrap_claim',?) ON CONFLICT(key) DO NOTHING RETURNING key",
            [JSON.stringify(new Date().toISOString())]);
        if(!claim)return res.status(409).json({error:'Initial setup already claimed'});

        // Generate .env file
        const envPath = generateEnvFile({ dbConfig: activeDbConfig, aiConfig, ssoConfig, authMode }, Number(process.env.PORT || 9001));

        // Reload environment variables runtime
        dotenv.config({ path: envPath, override: true });

        await db.saveConfig('ai_config', aiConfig);
        await db.saveConfig('db_config', activeDbConfig);
        await db.saveConfig('sso_config', ssoConfig);
        await db.saveConfig('auth_mode', authMode);
        await db.saveConfig('selected_tools', selectedTools || ['borg', 'restic']);
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

            token = jwt.sign({ id: user.id, email: user.email, role: user.role, authEpoch: user.auth_epoch }, getJwtSecret(), { expiresIn: '7d' });
        }

        await db.saveConfig('setup_complete', true);
        res.json({ success: true, user, token, envPath });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/database-health', authenticateToken, requireAdmin, async (_req, res) => {
    try {
        if (!db.isInitialized()) return res.status(503).json({ error: 'The controller database is not initialized' });
        await db.query('SELECT 1 AS healthy');
        res.json({ success: true, type: db.currentConfig?.type || 'unknown' });
    } catch { res.status(503).json({ error: 'The active database connection failed its query check' }); }
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
        if(!editableKeys.has(req.params.key))return res.status(403).json({error:'Configuration key is not public'});
        const value = await db.getConfig(req.params.key);
        res.json({ value: hideSecrets(value) });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Save config by key
router.put('/:key', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (req.params.key.startsWith('managed_agent_')) return res.status(403).json({error:'Managed agent records must use dedicated API'});
        const key=req.params.key;
        if(!editableKeys.has(key))return res.status(403).json({error:'Configuration key is read-only'});
        const incoming=req.body?.value;
        const isObject=(value:unknown):value is Record<string,unknown> =>
            !!value && typeof value==='object' && !Array.isArray(value);
        if(['ai_config','db_config','sso_config'].includes(key) && !isObject(incoming))
            return res.status(400).json({error:'Expected configuration object'});
        if(key==='auth_mode' && !['local','sso'].includes(incoming))
            return res.status(400).json({error:'Invalid authentication mode'});
        if(key==='selected_tools' && (!Array.isArray(incoming) ||
            incoming.length>8 || incoming.some(item=>!['borg','restic','rsync'].includes(item))))
            return res.status(400).json({error:'Invalid backup tools'});
        if(incoming===undefined || JSON.stringify(incoming).length>32768)
            return res.status(400).json({error:'Invalid configuration payload'});
        let value=incoming;
        if(isObject(incoming)){
            const previous=await db.getConfig<Record<string,unknown>>(key);
            value={...(isObject(previous)?previous:{}),...incoming};
            // Redacted GET responses omit sensitive fields. A metadata edit
            // must never erase previously stored credentials.
            for(const [field,prior] of Object.entries(isObject(previous)?previous:{})){
                if(/password|secret|token|apiKey|accessKey|privateKey|credential/i.test(field) &&
                   (incoming[field]===undefined || incoming[field]===''))
                    (value as Record<string,unknown>)[field]=prior;
            }
        }
        if (key === 'sso_config' && (value as any)?.provider && (value as any).provider !== 'github')
            return res.status(400).json({error:'Only GitHub SSO is implemented by this controller'});
        if (key === 'auth_mode' && value === 'sso') {
            const sso = await db.getConfig<any>('sso_config');
            if (sso?.provider !== 'github' || !sso.clientId || !sso.clientSecret) return res.status(400).json({error:'Configure a GitHub client ID and secret before enabling SSO'});
        }
        await db.saveConfig(key,value);
        res.json({success:true});
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
