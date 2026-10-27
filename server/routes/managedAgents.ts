import { Router } from 'express';
import crypto from 'node:crypto';
import * as db from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';

// All enrolled clients are configured locally with immutable backup credentials.
// Controller never transmits passwords, paths, or executable commands.
const router=Router();
type Job={id:string;operation:'backup'|'check'|'snapshots';state:'pending'|'running'|'success'|'failed';createdAt:string;startedAt?:string;finishedAt?:string;leaseUntil?:string;message?:string};
type Client={id:string;name:string;tokenHash:string;createdAt:string;lastSeen?:string;disabled:boolean;jobs:Job[]};
const idPattern=/^[0-9a-f-]{36}$/i;
const clientKey=(id:string)=>'managed_agent_'+id;
const admin=(req:any,res:any,next:any)=> req.user?.role==='admin'?next():res.status(403).json({error:'Admin required'});
const getClient=async(id:string):Promise<Client|null>=>idPattern.test(id)?db.getConfig<Client>(clientKey(id)):null;
const hash=(token:string)=>crypto.createHash('sha256').update(token).digest('hex');
const verify=(token:string,stored:string)=>{
 const a=Buffer.from(hash(token),'hex'), b=Buffer.from(stored,'hex');
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
};
async function authenticate(req:any,res:any,next:any){
 const id=req.header('x-fortress-agent-id');
 const token=/^Bearer (\\S+)$/.exec(req.header('authorization')||'')?.[1];
 if(!id||!token||token.length>256)return res.status(401).json({error:'Agent authentication required'});
 const client=await getClient(id);
 if(!client||client.disabled||!verify(token,client.tokenHash))return res.status(401).json({error:'Invalid agent credentials'});
 req.agent=client;
 next();
}
router.post('/admin/enroll',authenticateToken,admin,async(req,res)=>{
 const name=req.body?.name;
 if(typeof name!=='string'||name.length<1||name.length>100)return res.status(400).json({error:'Invalid client name'});
 const id=crypto.randomUUID(), token=crypto.randomBytes(32).toString('base64url');
 const client:Client={id,name,tokenHash:hash(token),createdAt:new Date().toISOString(),disabled:false,jobs:[]};
 await db.saveConfig(clientKey(id),client);
 const ids=await db.getConfig<string[]>('managed_agent_ids') || [];
 await db.saveConfig('managed_agent_ids',[...ids,id]);
 res.status(201).json({id,token,name,warning:'Token is shown once. Store it in an ACL-restricted file on the Windows client.'});
});
router.get('/admin',authenticateToken,admin,async(_req,res)=>{
 const ids=await db.getConfig<string[]>('managed_agent_ids')||[];
 const clients=await Promise.all(ids.map(getClient));
 res.json(clients.filter((x):x is Client=>x!==null).map(({tokenHash,...safe})=>safe));
});
router.get('/admin/:id',authenticateToken,admin,async(req,res)=>{
 const c=await getClient(req.params.id);
 if(!c)return res.sendStatus(404);
 const {tokenHash,...safe}=c;res.json(safe);
});
router.post('/admin/:id/jobs',authenticateToken,admin,async(req,res)=>{
 const c=await getClient(req.params.id);
 if(!c)return res.sendStatus(404);
 if(c.disabled)return res.status(409).json({error:'Client disabled'});
 const op=req.body?.operation;
 if(op!=='backup'&&op!=='check'&&op!=='snapshots')return res.status(400).json({error:'Unsupported operation'});
 if(c.jobs.some(j=>j.state==='pending'||j.state==='running'))return res.status(409).json({error:'Another job is active'});
 const job:Job={id:crypto.randomUUID(),operation:op,state:'pending',createdAt:new Date().toISOString()};
 c.jobs.push(job);await db.saveConfig(clientKey(c.id),c);res.status(201).json(job);
});
router.post('/admin/:id/disable',authenticateToken,admin,async(req,res)=>{
 const c=await getClient(req.params.id);if(!c)return res.sendStatus(404);
 c.disabled=true;await db.saveConfig(clientKey(c.id),c);res.json({disabled:true});
});
router.post('/poll',authenticate,async(req:any,res)=>{
 const c=req.agent as Client, now=Date.now();
 c.lastSeen=new Date().toISOString();
 const running=c.jobs.find(j=>j.state==='running');
 if(running){ // A timed-out job requires human intervention, not blind re-execution.
   if(Date.parse(running.leaseUntil||'')<now){running.state='failed';running.message='Execution lease expired; verify remote state before retrying';}
   else {await db.saveConfig(clientKey(c.id),c);return res.json({job:null});}
 }
 const job=c.jobs.find(j=>j.state==='pending');
 if(job){job.state='running';job.startedAt=new Date().toISOString();job.leaseUntil=new Date(now+6*60*60*1000).toISOString();}
 await db.saveConfig(clientKey(c.id),c);
 res.json({job:job?{id:job.id,operation:job.operation}:null});
});
router.post('/report',authenticate,async(req:any,res)=>{
 const c=req.agent as Client;
 const {id,success,message}=req.body||{};
 if(typeof id!=='string'||typeof success!=='boolean'||(message!==undefined&&(typeof message!=='string'||message.length>1024)))return res.status(400).json({error:'Invalid job report'});
 const job=c.jobs.find(j=>j.id===id&&j.state==='running');
 if(!job)return res.status(409).json({error:'No matching leased job'});
 job.state=success?'success':'failed';job.finishedAt=new Date().toISOString();job.message=message||'';
 await db.saveConfig(clientKey(c.id),c);res.json({ok:true});
});
export default router;
