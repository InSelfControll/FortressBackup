/**
 * Systems Routes - System CRUD and deployment operations
 */

import { Router } from 'express';
import crypto from 'crypto';
import * as db from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { toAPISystem, toDBSystem } from '../utils/mappers.js';
import { resolveSSHCredentialsFromRequest } from '../utils/sshCredentials.js';
import { deployToSystem, DeploymentLog } from '../services/ssh/index.js';

const router = Router();

// Get all systems
router.get('/', authenticateToken, async (req, res) => {
    try {
        const systems = await db.getAllSystems();
        res.json(systems.map(toAPISystem));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Create system
router.post('/', authenticateToken, async (req, res) => {
    try {
        const systemId = req.body.id || crypto.randomUUID();
        const system = { ...req.body, id: systemId };
        const dbSystem = toDBSystem(system);
        await db.saveSystem(dbSystem);
        res.json(toAPISystem(dbSystem));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update system
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const system = { ...req.body, id: req.params.id };
        const dbSystem = toDBSystem(system);
        await db.saveSystem(dbSystem);
        res.json(toAPISystem(dbSystem));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete system
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        await db.deleteSystem(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Deploy backup tools to a system via SSH
router.post('/:id/deploy', authenticateToken, async (req, res) => {
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
        const selectedTools = tools && Array.isArray(tools) && tools.length > 0
            ? tools
            : await db.getConfig<string[]>('selected_tools') || ['borg', 'restic'];
        console.log(`[Deploy] Starting deployment to ${system.name} (${system.host}), tools: ${selectedTools.join(', ')}`);

        // Prepare SSH config
        const sshConfig = {
            host: system.host,
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
            await db.saveSystem(updatedSystem);

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
