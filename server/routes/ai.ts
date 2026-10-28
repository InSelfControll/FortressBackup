import { Router } from 'express';
import { generateBackupConfig } from '../services/ai/generator.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import * as db from '../db/index.js';
import type { AIConfig } from '../../types.js';

const router = Router();
// All provider credentials and endpoint configuration are controller-owned.
router.post('/generate',authenticateToken,requireAdmin,async(req,res)=>{
 try{
  const prompt=req.body?.prompt;
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>4000)
   return res.status(400).json({error:'Prompt must be 1-4000 characters'});
  const config=await db.getConfig<AIConfig>('ai_config');
  if(!config || !config.provider)
   return res.status(409).json({error:'AI provider has not been configured'});
  const result=await generateBackupConfig(prompt,config);
  res.json(result);
 }catch(_error){
  res.status(502).json({error:'AI request failed'});
 }
});
export default router;
