/**
 * SSH Keys Routes - CRUD for SSH key management
 */

import { Router } from 'express';
import crypto from 'crypto';
import { utils as sshUtils } from 'ssh2';
import * as db from '../db/index.js';
import { authenticateToken, requireAdmin, getJwtSecret } from '../middleware/auth.js';
import { encrypt } from '../encryption.js';

const router = Router();

// Get all SSH keys (without sensitive data)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const keys = await db.getAllSSHKeys();
        // Return keys without sensitive data
        const safeKeys = keys.map(k => ({
            id: k.id,
            name: k.name,
            isEncrypted: !!k.is_encrypted,
            createdAt: k.created_at,
            // Don't send private_key_data or passphrase
        }));
        res.json(safeKeys);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Create SSH key
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, privateKey, passphrase } = req.body;

        if (typeof name !== 'string' || !name.trim() || name.length > 120 || typeof privateKey !== 'string' || !privateKey.startsWith('-----') || privateKey.length > 16384 || (passphrase !== undefined && (typeof passphrase !== 'string' || passphrase.length > 1024))) {
            return res.status(400).json({ error: 'Name and private key are required' });
        }

        const parsed = sshUtils.parseKey(privateKey, passphrase);
        if (parsed instanceof Error) return res.status(400).json({error:'The SSH private key could not be read. Check its format and passphrase.'});

        // Encrypt sensitive data using master key
        const encryptedKey = encrypt(privateKey, getJwtSecret());
        const encryptedPassphrase = passphrase ? encrypt(passphrase, getJwtSecret()) : undefined;

        const sshKey: db.SSHKey = {
            id: crypto.randomUUID(),
            name,
            private_key_data: JSON.stringify(encryptedKey),
            passphrase: encryptedPassphrase ? JSON.stringify(encryptedPassphrase) : undefined,
            is_encrypted: true,
            created_at: new Date().toISOString()
        };

        await db.saveSSHKey(sshKey);

        res.json({ success: true, id: sshKey.id });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete SSH key
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (await db.getOne('SELECT id FROM systems WHERE ssh_key_id=?', [req.params.id])) return res.status(409).json({error:'This identity is assigned to a system. Remove that assignment before deleting the key.'});
        await db.deleteSSHKey(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
