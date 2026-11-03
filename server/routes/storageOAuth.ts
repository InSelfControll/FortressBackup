import {Router} from 'express';
import {authenticateToken,requireAdmin} from '../middleware/auth.js';
import {publicOAuthSettings,saveOAuthSettings,cloudProvider,beginCloudLogin,completeCloudLogin,cloudLoginStatus,forgetCloudLogin} from '../services/storageOAuth.js';

const router=Router();
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');next()});
const cookieName='fortress_cloud_oauth';
const cookieOptions={httpOnly:true,secure:true,sameSite:'lax' as const,path:'/api/storage-oauth/callback',maxAge:600_000};
const owner=(req:any)=>String(req.user.id);
router.get('/settings',authenticateToken,requireAdmin,async(_req,res,next)=>{try{res.json(await publicOAuthSettings())}catch(error){next(error)}});
router.put('/settings',authenticateToken,requireAdmin,async(req,res)=>{try{res.json(await saveOAuthSettings(req.body))}catch(error){res.status(400).json({error:error instanceof Error?error.message:'Invalid OAuth settings'})}});
router.post('/:provider/start',authenticateToken,requireAdmin,async(req,res)=>{
    if(!cloudProvider(req.params.provider))return res.status(400).json({error:'Unsupported cloud provider'});
    if(!req.secure)return res.status(400).json({error:'Open the trusted HTTPS dashboard to sign in to cloud storage'});
    try{
        const origin=new URL(req.protocol+'://'+req.get('host')).origin;
        const {id,nonce,url}=await beginCloudLogin(req.params.provider,owner(req),origin);
        res.cookie(cookieName,nonce,cookieOptions);res.json({id,url});
    }catch(error){res.status(400).json({error:error instanceof Error?error.message:'Could not start cloud sign-in'})}
});
router.get('/callback/:provider',async(req,res)=>{
    res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    if(!req.secure||!cloudProvider(req.params.provider))return res.status(400).type('text').send('Invalid cloud callback');
    const nonce=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
    try{
        await completeCloudLogin(req.params.provider,typeof req.query.state==='string'?req.query.state:'',nonce,typeof req.query.code==='string'?req.query.code:'',!!req.query.error);
        res.clearCookie(cookieName,{...cookieOptions,maxAge:undefined});
        res.type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Fortress Backup cloud sign-in</title><h1>Return to Fortress Backup</h1><p>You can close this tab. The dashboard will show the sign-in result. Save the storage location to apply the connection.</p></html>');
    }catch{res.status(400).type('text').send('Cloud sign-in expired or belongs to another browser. Start sign-in again from the dashboard')}
});
router.get('/flows/:id',authenticateToken,requireAdmin,(req,res)=>{try{res.json(cloudLoginStatus(req.params.id,owner(req)))}catch{res.status(404).json({error:'Cloud sign-in expired. Start again'})}});
router.delete('/flows/:id',authenticateToken,requireAdmin,(req,res)=>{try{forgetCloudLogin(req.params.id,owner(req));res.json({ok:true})}catch{res.sendStatus(404)}});
export default router;
