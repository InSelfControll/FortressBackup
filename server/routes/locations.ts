/**
 * Locations Routes - Storage location CRUD operations
 */

import { Router } from 'express';
import { checkSFTPLocation,checkCloudLocation } from '../services/connectionChecks.js';
import crypto from 'crypto';
import * as db from '../db/index.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { validateHostPublicKey } from '../services/backup/rsync.js';

import {azureRepository,rcloneConfig,gcsRepository,gcsCredentials} from '../services/backup/cloudStorage.js';
import {cloudLoginCredential,forgetCloudLogin} from '../services/storageOAuth.js';
const router = Router();
function applyCloudLogin(req:any,location:any){
    if(req.body.oauth_flow_id!==undefined){
        if(typeof req.body.oauth_flow_id!=='string'||req.body.oauth_flow_id.length>128)throw new Error('Invalid cloud sign-in');
        location.secret_key=cloudLoginCredential(req.body.oauth_flow_id,String(req.user.id),location.type);
    }
}
function finishCloudLogin(req:any){if(req.body.oauth_flow_id){try{forgetCloudLogin(req.body.oauth_flow_id,String(req.user.id))}catch{/* An expired draft must not turn a successful database save into an error. */}}}

function validateCloud(location:any){
    if(location.type==='azure')azureRepository({destinationPath:location.path,destinationRegion:location.region,destinationAccessKey:location.access_key,destinationSecretKey:location.secret_key});
    if(location.type==='gdrive'||location.type==='onedrive')return rcloneConfig(location.type,location.path,location.secret_key);
    if(location.type==='gcs'){gcsRepository({destinationPath:location.path,destinationRegion:location.region,destinationSecretKey:location.secret_key});return gcsCredentials(location.secret_key)}
}

const validLocation=(location:any):boolean=>{
    if(typeof location.name!=='string'||!location.name.trim()||location.name.length>120||
       typeof location.path!=='string'||!location.path.trim()||location.path.length>1024||
       !['s3','sftp','nfs','b2','gcs','azure','gdrive','onedrive'].includes(location.type)||
       (location.access_key!==undefined&&(typeof location.access_key!=='string'||location.access_key.length>4096))||
       (location.secret_key!==undefined&&(typeof location.secret_key!=='string'||location.secret_key.length>16384)))
        return false;
    if(location.host_public_key==null || location.host_public_key==='')return location.type!=='sftp';
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

// Verify saved credentials and the remote directory without modifying storage.
router.post('/:id/test', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const location = await db.getLocation(req.params.id);
        if (!location) return res.status(404).json({ error: 'Location not found' });
        if(['azure','gdrive','gcs','onedrive'].includes(location.type)){
            await checkCloudLocation(location);
            return res.json({success:true,message:'Cloud authentication and folder access verified. This does not initialize or verify a Restic repository.'});
        }
        if (location.type !== 'sftp') return res.status(501).json({ error: 'Direct connection testing is available for SFTP locations. Validate other storage types with a backup and restore on the source system.' });
        await checkSFTPLocation(location);
        res.json({ success: true, message: 'SFTP authentication, host identity, and repository directory verified' });
    } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Connection verification failed' });
    }
});

// Create location
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const location = { ...req.body, id: crypto.randomUUID() };
        try{applyCloudLogin(req,location)}catch(error){return res.status(400).json({error:error instanceof Error?error.message:'Invalid cloud sign-in'})}
        if (!validLocation(location)) {
            return res.status(400).json({error:'Invalid location configuration'});
        }
        try{const normalized=validateCloud(location);if(normalized)location.secret_key=normalized}catch(error){return res.status(400).json({error:error instanceof Error?error.message:'Invalid cloud configuration'})}
        if(location.host_public_key)location.host_public_key=validateHostPublicKey(location.host_public_key);
        await db.saveLocation(location);
        finishCloudLogin(req);
        res.json(await db.getPublicLocation(location.id));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update location
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (!await db.getOne('SELECT id FROM locations WHERE id=?',[req.params.id])) return res.status(404).json({error:'Location not found'});
        const previous=await db.getLocation(req.params.id);
        const location = { ...req.body, id: req.params.id };
        try{applyCloudLogin(req,location)}catch(error){return res.status(400).json({error:error instanceof Error?error.message:'Invalid cloud sign-in'})}
        if (!validLocation(location)) {
            return res.status(400).json({error:'Invalid location configuration'});
        }
        try{const normalized=validateCloud({...previous,...location});if(normalized)location.secret_key=normalized}catch(error){return res.status(400).json({error:error instanceof Error?error.message:'Invalid cloud configuration'})}
        if(location.host_public_key)location.host_public_key=validateHostPublicKey(location.host_public_key);
        await db.saveLocation(location);
        finishCloudLogin(req);
        res.json(await db.getPublicLocation(location.id));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete location
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (await db.getOne('SELECT id FROM jobs WHERE destination_id=?',[req.params.id])) return res.status(409).json({error:'This location is used by a backup job. Update or remove that job first.'});
        await db.deleteLocation(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
