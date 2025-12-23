/**
 * SSH Keys Routes - CRUD for SSH key management
 */

import { Router } from 'express';
import crypto from 'crypto';
import * as db from '../db/index.js';
import { authenticateToken, getJwtSecret } from '../middleware/auth.js';
import { encrypt } from '../encryption.js';

const router = Router();

// Get all SSH keys (without sensitive data)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const keys = await db.getAllSSHKeys();
        // Return keys without sensitive data
        const safeKeys = keys.map(k => ({
            id: k.id,
            name: k.name,
            isEncrypted: !!k.is_encrypted,
            // Don't send private_key_data or passphrase
        }));
        res.json(safeKeys);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Create SSH key
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, privateKey, passphrase } = req.body;

        if (!name || !privateKey) {
            return res.status(400).json({ error: 'Name and private key are required' });
        }

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
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        await db.deleteSSHKey(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
