/**
 * Locations Routes - Storage location CRUD operations
 */

import { Router } from 'express';
import crypto from 'crypto';
import * as db from '../db/index.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { validateHostPublicKey } from '../services/backup/rsync.js';

const router = Router();
const validLocation=(location:any):boolean=>{
    if(typeof location.name!=='string'||!location.name.trim()||location.name.length>120||
       typeof location.path!=='string'||!location.path.trim()||location.path.length>1024||
       !['s3','sftp','nfs','b2','gcs','azure','gdrive','onedrive'].includes(location.type)||
       (location.access_key!==undefined&&(typeof location.access_key!=='string'||location.access_key.length>4096))||
       (location.secret_key!==undefined&&(typeof location.secret_key!=='string'||location.secret_key.length>4096)))
        return false;
    if(location.host_public_key===undefined)return location.type!=='sftp';
    try{validateHostPublicKey(location.host_public_key);return true;}catch{return false;}
};

// Get all locations
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const locations = await db.getAllLocations();
        res.json(locations);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Create location
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const location = { ...req.body, id: crypto.randomUUID() };
        if (!validLocation(location)) {
            return res.status(400).json({error:'Invalid location configuration'});
        }
        if(location.host_public_key)location.host_public_key=validateHostPublicKey(location.host_public_key);
        await db.saveLocation(location);
        res.json({id:location.id,name:location.name,type:location.type,path:location.path,
            endpoint:location.endpoint,region:location.region,host_public_key:location.host_public_key,
            hasAccessKey:!!location.access_key,hasSecretKey:!!location.secret_key});
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update location
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const location = { ...req.body, id: req.params.id };
        if (!validLocation(location)) {
            return res.status(400).json({error:'Invalid location configuration'});
        }
        if(location.host_public_key)location.host_public_key=validateHostPublicKey(location.host_public_key);
        await db.saveLocation(location);
        res.json({id:location.id,name:location.name,type:location.type,path:location.path,
            endpoint:location.endpoint,region:location.region,host_public_key:location.host_public_key,
            hasAccessKey:!!location.access_key,hasSecretKey:!!location.secret_key});
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete location
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await db.deleteLocation(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
