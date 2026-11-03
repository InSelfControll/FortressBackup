import {test,expect,spyOn} from 'bun:test';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import oauth from '../server/routes/storageOAuth.js';
import locations from '../server/routes/locations.js';
import {initDatabase,closeDatabase} from '../server/db/connection.js';
import {run,getOne} from '../server/db/helpers.js';
import {readyCloudLocation} from '../server/services/storageOAuth.js';
import {getLocation,replaceLocationSecret} from '../server/db/locations.js';

test('cloud OAuth is admin-scoped, PKCE/cookie-bound, replay-safe and keeps secrets out of browser responses',async()=>{
 const original={jwt:process.env.JWT_SECRET,key:process.env.FORTRESS_CREDENTIAL_KEY};
 const signing=crypto.randomBytes(48).toString('hex');process.env.JWT_SECRET=signing;process.env.FORTRESS_CREDENTIAL_KEY=crypto.randomBytes(32).toString('hex');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'fortress-oauth-'));
 await initDatabase({type:'sqlite',filePath:path.join(directory,'test.db')});
 const app=express();app.set('trust proxy','loopback');app.use(express.json());app.use('/api/storage-oauth',oauth);app.use('/api/locations',locations);
 const server=app.listen(0,'127.0.0.1');const base='http://127.0.0.1:'+(server.address() as any).port;
 const nativeFetch=globalThis.fetch;
 let providerCalls=0,lastVerifier='',lastClientSecret='';
 const provider=spyOn(globalThis,'fetch').mockImplementation((async(input:any,init:any)=>{
  const url=String(input);
  if(!url.startsWith('https://oauth2.googleapis.com/')&&!url.startsWith('https://login.microsoftonline.com/')&&!url.startsWith('https://graph.microsoft.com/'))throw new Error('Unexpected provider URL');
  providerCalls++;expect(init.redirect).toBe('error');
  if(url.startsWith('https://graph.microsoft.com/')){expect(init.headers.Authorization).toBe('Bearer test-access');return Response.json({id:'b!test_drive',driveType:'personal'})}
  const data=new URLSearchParams(init.body);if(data.get('grant_type')==='refresh_token'){expect(url).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token');expect(data.get('refresh_token')).toBe('test-refresh');return Response.json({access_token:'rotated-access',refresh_token:'rotated-refresh',expires_in:3600})}expect(data.get('grant_type')).toBe('authorization_code');lastVerifier=data.get('code_verifier')!;lastClientSecret=data.get('client_secret')!;
  return Response.json({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600,token_type:'Bearer'});
 }) as typeof fetch);
 try{
  for(const [id,role] of [['admin','admin'],['other','admin'],['viewer','viewer']])await run('INSERT INTO users(id,email,name,role,auth_type) VALUES(?,?,?,?,?)',[id,id+'@example.invalid',id,role,'local']);
  const token=(id='admin')=>jwt.sign({id,role:id==='viewer'?'viewer':'admin',authEpoch:0},signing);
  const request=async(route:string,method='GET',body?:unknown,id='admin',extra:Record<string,string>={})=>{
   const response=await nativeFetch(base+'/api'+route,{method,headers:{Host:'controller.example.invalid',Authorization:'Bearer '+token(id),'Content-Type':'application/json','X-Forwarded-Proto':'https',...extra},body:body===undefined?undefined:JSON.stringify(body)});
   const text=await response.text();let data:any;try{data=JSON.parse(text)}catch{data=text}return {response,status:response.status,data,text};
  };
  expect((await request('/storage-oauth/settings','GET',undefined,'viewer')).status).toBe(403);
  const settings={origin:'https://controller.example.invalid',google:{clientId:'test.apps.googleusercontent.com',clientSecret:'test-google-secret'},microsoft:{clientId:'12345678-1234-1234-1234-123456789012',clientSecret:'test-microsoft-secret'}};
  for(const origin of ['http://controller.example.invalid','https://user:pass@controller.example.invalid','https://controller.example.invalid/path'])expect((await request('/storage-oauth/settings','PUT',{...settings,origin})).status).toBe(400);
  const saved=await request('/storage-oauth/settings','PUT',settings);expect(saved.status).toBe(200);expect(saved.data.google.hasClientSecret).toBe(true);expect(saved.text).not.toContain('test-google-secret');
  expect((await getOne<any>("SELECT value FROM config WHERE key='storage_oauth'"))?.value).not.toContain('test-google-secret');
  expect((await request('/storage-oauth/settings','PUT',{...settings,google:{clientId:settings.google.clientId,clientSecret:''}})).status).toBe(200);
  app.set('trust proxy',false);expect((await request('/storage-oauth/gdrive/start','POST',{})).status).toBe(400);app.set('trust proxy','loopback');
  expect((await request('/storage-oauth/gdrive/start','POST',{},'admin',{Host:'attacker.example.invalid'})).status).toBe(400);
  for(const type of ['gdrive','gcs','onedrive']){
   const start=await request('/storage-oauth/'+type+'/start','POST',{});expect(start.status).toBe(200);
   const cookie=start.response.headers.get('set-cookie')!.split(';')[0];expect(start.response.headers.get('set-cookie')).toContain('HttpOnly');expect(start.response.headers.get('set-cookie')).toContain('Secure');
   const authorization=new URL(start.data.url);expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');expect(authorization.searchParams.get('redirect_uri')).toBe('https://controller.example.invalid/api/storage-oauth/callback/'+type);
   expect((await request('/storage-oauth/flows/'+start.data.id,'GET',undefined,'other')).status).toBe(404);
   const callback='/storage-oauth/callback/'+type+'?state='+start.data.id+'&code=test-code';
   const before=providerCalls;expect((await request(callback)).status).toBe(400);expect(providerCalls).toBe(before);
   expect((await request(callback,'GET',undefined,'admin',{Cookie:cookie})).status).toBe(200);
   expect(crypto.createHash('sha256').update(lastVerifier).digest('base64url')).toBe(authorization.searchParams.get('code_challenge'));expect(lastClientSecret).toBe(type==='onedrive'?'test-microsoft-secret':'test-google-secret');
   expect((await request(callback,'GET',undefined,'admin',{Cookie:cookie})).status).toBe(400);
   const status=await request('/storage-oauth/flows/'+start.data.id);expect(status.data.status).toBe('ready');expect(status.text).not.toContain('test-refresh');expect(status.text).not.toContain('test-access');
   const body={name:'Browser '+type,type,path:type==='gcs'?'test-bucket':'fortress:backups',oauth_flow_id:start.data.id};
   expect((await request('/locations','POST',{...body,type:type==='gcs'?'gdrive':'gcs'})).status).toBe(400);
   const location=await request('/locations','POST',body);expect(location.status).toBe(200);expect(location.data.hasSecretKey).toBe(true);expect(location.text).not.toContain('test-refresh');expect(location.text).not.toContain('test-google-secret');
   const privateLocation=await getLocation(location.data.id);expect(privateLocation?.secret_key).toContain('test-refresh');
   if(type==='onedrive'){
    expect(privateLocation?.secret_key).toContain('drive_id = b!test_drive');
    const time=spyOn(Date,'now').mockReturnValue(Date.now()+3_601_000);
    try{
     const beforeRefresh=providerCalls;
     const [a,b]=await Promise.all([readyCloudLocation(privateLocation!),readyCloudLocation(privateLocation!)]);
     expect(providerCalls).toBe(beforeRefresh+1);expect(a.secret_key).toBe(b.secret_key);expect(a.secret_key).toContain('rotated-refresh');
     expect((await getLocation(location.data.id))?.secret_key).toBe(a.secret_key);
     expect(await replaceLocationSecret(location.data.id,privateLocation!.secret_key!,'stale write')).toBe(false);
     await readyCloudLocation(a);expect(providerCalls).toBe(beforeRefresh+1);
     expect((await getOne<any>('SELECT secret_key FROM locations WHERE id=?',[location.data.id]))?.secret_key).not.toContain('rotated-refresh');
    }finally{time.mockRestore()}
   }
   if(type==='gcs')expect(JSON.parse(privateLocation!.secret_key!).type).toBe('authorized_user');
   expect((await request('/locations','POST',body)).status).toBe(400);
  }
  const denied=await request('/storage-oauth/gdrive/start','POST',{});const cookie=denied.response.headers.get('set-cookie')!.split(';')[0];
  expect((await request('/storage-oauth/callback/gdrive?state='+denied.data.id+'&error=access_denied','GET',undefined,'admin',{Cookie:cookie})).status).toBe(200);
  expect((await request('/storage-oauth/flows/'+denied.data.id)).data.status).toBe('failed');
  const expired=await request('/storage-oauth/gdrive/start','POST',{});
  const clock=spyOn(Date,'now').mockReturnValue(Date.now()+601000);
  try{expect((await request('/storage-oauth/flows/'+expired.data.id)).status).toBe(404)}finally{clock.mockRestore()}
 }finally{provider.mockRestore();await new Promise<void>(resolve=>server.close(()=>resolve()));await closeDatabase();fs.rmSync(directory,{recursive:true,force:true});for(const [name,value] of Object.entries({JWT_SECRET:original.jwt,FORTRESS_CREDENTIAL_KEY:original.key})){if(value===undefined)delete process.env[name];else process.env[name]=value}}
},30000);
