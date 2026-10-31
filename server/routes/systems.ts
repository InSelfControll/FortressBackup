/**
 * Systems Routes - System CRUD and deployment operations
 */

import { Router } from 'express';
import crypto from 'crypto';
import * as db from '../db/index.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { toAPISystem, toDBSystem } from '../utils/mappers.js';
import { resolveSSHCredentialsFromRequest } from '../utils/sshCredentials.js';
import { deployToSystem, DeploymentLog } from '../services/ssh/index.js';
import { validateHostPublicKey } from '../services/backup/rsync.js';
import { hostFingerprintFromPublicKey } from '../services/ssh/hostKey.js';

const router = Router();
const withHostFingerprint=(system:any):any=>
    system.hostPublicKey && !system.hostFingerprint
        ? {...system,hostFingerprint:hostFingerprintFromPublicKey(system.hostPublicKey)}
        : system;
const validHostPublicKey=(value:unknown):boolean=>{
    if(value===undefined)return true;
    try{validateHostPublicKey(value);return true;}catch{return false;}
};
const saveSystem=async(system:any):Promise<void>=>{
    await db.saveSystem(system);
    await db.run('UPDATE systems SET host_public_key=? WHERE id=?',[system.host_public_key||null,system.id]);
};
const validSystem=(value:any):boolean =>
    value && typeof value.name==='string' && value.name.trim().length>0 && value.name.length<=120 &&
    typeof value.host==='string' && value.host.length<=253 &&
    /^[a-zA-Z0-9.:-]{1,253}$/.test(value.host) &&
    (value.port===undefined || Number.isInteger(value.port) && value.port>=1 && value.port<=65535) &&
    (value.username===undefined || typeof value.username==='string' &&
      /^[A-Za-z0-9._-]{1,120}$/.test(value.username)) &&
    (value.hostFingerprint===undefined || typeof value.hostFingerprint==='string' &&
      /^SHA256:[A-Za-z0-9+/]{43}=?$/.test(value.hostFingerprint)) &&
    validHostPublicKey(value.hostPublicKey);


// Get all systems
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const systems = await db.getAllSystems();
        res.json(systems.map(toAPISystem));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Create system
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (!validSystem(req.body))
            return res.status(400).json({error:'Invalid system host, user or fingerprint'});
        const systemId = crypto.randomUUID();
        const system = withHostFingerprint({ ...req.body, id: systemId });
        const dbSystem = toDBSystem(system);
        await saveSystem(dbSystem);
        res.json(toAPISystem(dbSystem));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update system
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (!validSystem(req.body))
            return res.status(400).json({error:'Invalid system host, user or fingerprint'});
        const system = withHostFingerprint({ ...req.body, id: req.params.id });
        const dbSystem = toDBSystem(system);
        await saveSystem(dbSystem);
        res.json(toAPISystem(dbSystem));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete system
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await db.deleteSystem(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Deploy backup tools to a system via SSH
router.post('/:id/deploy', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const systemId = req.params.id;

        // Get system details
        const system = await db.getSystem(systemId);
        if (!system) {
            return res.status(404).json({ error: 'System not found' });
        }

        // Resolve SSH credentials
        const credentials = await resolveSSHCredentialsFromRequest(req.body, system.ssh_key_id);

        // Get tools from request or fall back to config
        const { tools } = req.body;
        if(tools !== undefined && (!Array.isArray(tools) || tools.length>3 ||
            tools.some((item:unknown)=>!['restic','rsync','borg'].includes(String(item)))))
            return res.status(400).json({error:'Unsupported deployment tool'});
        const selectedTools = tools && Array.isArray(tools) && tools.length > 0
            ? tools
            : await db.getConfig<string[]>('selected_tools') || ['borg', 'restic'];
        console.log(`[Deploy] Starting deployment to ${system.name} (${system.host}), tools: ${selectedTools.join(', ')}`);

        // Prepare SSH config
        const sshConfig = {
            host: system.host,
            hostFingerprint: system.host_fingerprint || '',
            port: system.port || 22,
            username: system.username || 'root',
            privateKey: credentials.privateKey,
            passphrase: credentials.passphrase,
            password: credentials.password
        };

        // Collect logs to stream
        const logs: DeploymentLog[] = [];

        // Deploy with selected tools
        const result = await deployToSystem(sshConfig, selectedTools, (log) => {
            if(logs.length>=2000) logs.shift();
            logs.push(log);
            console.log(`[Deploy] [${log.type}] ${log.message}`);
        });

        if (result.success) {
            // Update system with installed tools
            const updatedSystem = {
                ...system,
                installed_tools: JSON.stringify(result.installedTools),
                status: 'online' as const,
                last_seen: new Date().toISOString()
            };
            await saveSystem(updatedSystem);

            res.json({
                success: true,
                installedTools: result.installedTools,
                logs: logs
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error,
                logs: logs
            });
        }
    } catch (error: any) {
        console.error('[Deploy] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
