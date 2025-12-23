/**
 * Locations Routes - Storage location CRUD operations
 */

import { Router } from 'express';
import crypto from 'crypto';
import * as db from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Get all locations
router.get('/', authenticateToken, async (req, res) => {
    try {
        const locations = await db.getAllLocations();
        res.json(locations);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Create location
router.post('/', authenticateToken, async (req, res) => {
    try {
        const location = { ...req.body, id: req.body.id || crypto.randomUUID() };
        await db.saveLocation(location);
        res.json(location);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update location
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const location = { ...req.body, id: req.params.id };
        await db.saveLocation(location);
        res.json(location);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete location
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        await db.deleteLocation(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
