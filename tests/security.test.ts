import { test, expect } from 'bun:test';
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { initDatabase, closeDatabase } from '../server/db/connection.js';
import { getOne, run } from '../server/db/helpers.js';
import jobs from '../server/routes/jobs.js';
import systems from '../server/routes/systems.js';
import locations from '../server/routes/locations.js';
import keys from '../server/routes/sshKeys.js';
import ai from '../server/routes/ai.js';
import auth from '../server/routes/auth.js';
import configRouter from '../server/routes/config.js';
import { getLocation } from '../server/db/locations.js';
import { createUser, getUserByEmail } from '../server/db/users.js';
import { saveConfig, getConfig } from '../server/db/config.js';
import { sshHostVerifier } from '../server/services/ssh/hostKey.js';
import { buildBorgCommand, buildBorgRestoreCommand } from '../server/services/backup/borg.js';
import { buildResticCommand } from '../server/services/backup/restic.js';
import { buildRsyncCommand } from '../server/services/backup/rsync.js';
import { selectVerifiedGitHubEmail } from '../server/security/githubIdentity.js';
import { appendBoundedJobLog, MAX_JOB_LOGS } from '../server/utils/boundedLog.js';

test('privileged APIs deny viewers and never echo stored credentials', async()=>{
 process.env.JWT_SECRET=crypto.randomBytes(48).toString('hex');
 process.env.FORTRESS_CREDENTIAL_KEY=crypto.randomBytes(32).toString('hex');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fortress-security-'));
 await initDatabase({type:'sqlite',filePath:path.join(dir,'db.sqlite')});
 await run('INSERT INTO users(id,email,name,role,auth_type) VALUES(?,?,?,?,?)',['admin','admin@example.invalid','Admin','admin','local']);
 await run('INSERT INTO users(id,email,name,role,auth_type) VALUES(?,?,?,?,?)',['viewer','viewer@example.invalid','Viewer','viewer','local']);
 const app=express(); app.use(express.json());
 app.use('/api/jobs',jobs);app.use('/api/systems',systems);
 app.use('/api/locations',locations);app.use('/api/keys',keys);
  app.use('/api/ai',ai);app.use('/api/auth',auth);
  app.use('/api/config',configRouter);
 const server=app.listen(0,'127.0.0.1');
 try{
  const a=server.address();if(!a||typeof a==='string')throw Error('bind failed');
  const base='http://127.0.0.1:'+a.port+'/api';
  const viewer=jwt.sign({id:'viewer',role:'viewer',authEpoch:0},process.env.JWT_SECRET);
  const admin=jwt.sign({id:'admin',role:'admin',authEpoch:0},process.env.JWT_SECRET);
  const staleRole=jwt.sign({id:'viewer',role:'admin',authEpoch:0},process.env.JWT_SECRET);
  const request=(route:string,token:string,method='GET',body?:unknown)=>fetch(base+route,{
   method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:body===undefined?undefined:JSON.stringify(body)
  });
  for(const route of ['/jobs','/systems','/locations','/keys']){
   expect((await request(route,viewer)).status).toBe(403);
   expect((await request(route,staleRole)).status).toBe(403);
  }
  for(const route of ['/jobs','/systems','/locations','/keys']){
   expect((await request(route,viewer,'POST',{})).status).toBe(403);
  }
  for(const route of ['/jobs/abc/run','/jobs/abc/restore','/systems/abc/deploy']){
   expect((await request(route,viewer,'POST',{})).status).toBe(403);
  }
  const access='test-access-'+crypto.randomBytes(8).toString('hex');
  const secret='test-secret-'+crypto.randomBytes(8).toString('hex');
  const created=await request('/locations',admin,'POST',
   {name:'Private',type:'s3',path:'example',access_key:access,secret_key:secret});
  expect(created.status).toBe(200);
  const response=await created.json() as any;
  expect(JSON.stringify(response)).not.toContain(secret);
  expect(JSON.stringify(response)).not.toContain(access);
  const listing=await (await request('/locations',admin)).text();
  expect(listing).not.toContain(secret);
  expect(listing).not.toContain(access);
  const row=await getOne<{access_key:string;secret_key:string}>(
   'SELECT access_key,secret_key FROM locations WHERE id=?',[response.id]);
  expect(row?.access_key.startsWith('enc:v1:')).toBe(true);
  expect(row?.secret_key.startsWith('enc:v1:')).toBe(true);
  expect((await getLocation(response.id))?.secret_key).toBe(secret);
  const aiSecret='test-ai-'+crypto.randomBytes(24).toString('hex');
  await saveConfig('ai_config',{provider:'Gemini',apiKey:aiSecret});
  const sealed=await getOne<{value:string}>('SELECT value FROM config WHERE key=?',['ai_config']);
  expect(sealed?.value).not.toContain(aiSecret);
  expect(sealed?.value).toContain('fortressEncryptedVersion');
  expect((await getConfig<{apiKey:string}>('ai_config'))?.apiKey).toBe(aiSecret);
  const updateAi=await request('/config/ai_config',admin,'PUT',{value:{provider:'Gemini',model:'test-model'}});
  expect(updateAi.status).toBe(200);
  const preserved=await getConfig<{apiKey:string;model:string}>('ai_config');
  expect(preserved?.apiKey).toBe(aiSecret);
  expect(preserved?.model).toBe('test-model');
  const exposed=await (await request('/config/ai_config',admin)).text();
  expect(exposed).not.toContain(aiSecret);
  const forbidden=await request('/config/ai_config',viewer);
  expect(forbidden.status).toBe(403);

  await run('INSERT INTO config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    ['sso_config',JSON.stringify({provider:'github',clientSecret:aiSecret})]);
  expect((await getConfig<{clientSecret:string}>('sso_config'))?.clientSecret).toBe(aiSecret);
  const migrated=await getOne<{value:string}>('SELECT value FROM config WHERE key=?',['sso_config']);
  expect(migrated?.value).not.toContain(aiSecret);
  const currentKey=process.env.FORTRESS_CREDENTIAL_KEY;
  process.env.FORTRESS_CREDENTIAL_KEY=crypto.randomBytes(32).toString('hex');
  try{
    await expect(getConfig('ai_config')).rejects.toThrow();
  }finally{
    process.env.FORTRESS_CREDENTIAL_KEY=currentKey;
  }

 }finally{
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  await closeDatabase();fs.rmSync(dir,{recursive:true,force:true});
 }
},30000);

test('pinned host-key identity and command builders reject unsafe input',()=>{
 const publicKey=crypto.randomBytes(64);
 const fp='SHA256:'+crypto.createHash('sha256').update(publicKey).digest('base64').replace(/=+$/,'');
 const verify=sshHostVerifier(fp);
 expect(verify(publicKey)).toBe(true);
 expect(verify(crypto.randomBytes(64))).toBe(false);
 expect(()=>sshHostVerifier(undefined)).toThrow();
 const hostPublicKey='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINb3o4m8E7d1+Nh4V2m3zF6nY7sR4r7yYh6m4fK3M2bV';
 const config:any={tool:'restic',destinationType:'sftp',destinationPath:'host:repo',destinationHostPublicKey:hostPublicKey,
  destinationSecretKey:'-----BEGIN OPENSSH PRIVATE KEY-----\ndummy-private-key-material\n-----END OPENSSH PRIVATE KEY-----\n',
  sourcePaths:['/home/test user'],repoPassword:crypto.randomBytes(32).toString('hex'),jobName:'backup'};
 const cmd=buildResticCommand(config);
 expect(cmd).toContain(' -- ');
 expect(cmd).toContain(`host ${hostPublicKey}`);
 expect(cmd).toContain('StrictHostKeyChecking=yes');
 expect(cmd).toContain('GlobalKnownHostsFile=/dev/null');
 expect(cmd).toContain('UserKnownHostsFile="$FORTRESS_TRUST_DIR/known_hosts"');
 expect(cmd).not.toContain('/etc/fortress/known_hosts');
 expect(()=>buildResticCommand({...config,destinationHostPublicKey:undefined})).toThrow('host public key');
 expect(()=>buildResticCommand({...config,sourcePaths:['--help']})).toThrow();
 expect(()=>buildResticCommand({...config,sourcePaths:['/etc/../root']})).toThrow();
 expect(()=>buildResticCommand({...config,sourcePaths:['/tmp/bad\nname']})).toThrow();
 const borg=buildBorgCommand({...config,tool:'borg',destinationType:'nfs',destinationPath:'/safe/repo'});
 expect(borg).not.toContain('rm -rf');
 expect(borg).not.toContain('borg init');
 expect(borg).not.toContain('borg prune');
 const rsync={...config,tool:'rsync',destinationPath:'/tmp/restic-safe',sourcePaths:['/home/docs']};
 const ssh:any={username:'backup',host:'backup.example.net',port:22,hostFingerprint:fp,hostPublicKey};
 const rsyncCommand=buildRsyncCommand(rsync,ssh,true);
 expect(rsyncCommand).toContain('StrictHostKeyChecking=yes');
 expect(rsyncCommand).toContain('GlobalKnownHostsFile=/dev/null');
 expect(rsyncCommand).toContain('UserKnownHostsFile="$FORTRESS_TRUST_DIR/known_hosts"');
 expect(rsyncCommand).not.toContain('/etc/fortress/known_hosts');
 expect(rsyncCommand).not.toContain('StrictHostKeyChecking=no');
 expect(()=>buildRsyncCommand({...rsync,sourcePaths:['/tmp/;touch /tmp/owned']},ssh,true)).toThrow();
 expect(()=>buildRsyncCommand(rsync,{...ssh,host:'example.net; echo injected'},true)).toThrow();
 expect(()=>buildRsyncCommand(rsync,{...ssh,hostFingerprint:''},true)).toThrow();
 const restore=buildBorgRestoreCommand({...config,tool:'borg',destinationType:'nfs',destinationPath:'/safe/repo'},'backup-2026','/tmp/restore');
 expect(restore).not.toContain('exit 0');
});

test('GitHub identities require provider-verified email ownership',()=>{
  expect(selectVerifiedGitHubEmail(undefined)).toBeNull();
  expect(selectVerifiedGitHubEmail([{email:'admin@example.invalid',primary:true,verified:false}])).toBeNull();
  expect(selectVerifiedGitHubEmail([{email:'admin@example.invalid',primary:true,verified:true}])).toBe('admin@example.invalid');
  expect(selectVerifiedGitHubEmail([
    {email:'unverified@example.invalid',primary:true,verified:false},
    {email:'Verified@Example.invalid',primary:false,verified:true}
  ])).toBe('verified@example.invalid');
});

test('backup log buffer stays bounded without quadratic per-message shifting',()=>{
  const logs:number[]=[];
  for(let i=0;i<10000;i++)appendBoundedJobLog(logs,i);
  expect(logs.length).toBeLessThanOrEqual(MAX_JOB_LOGS);
  expect(logs.at(-1)).toBe(9999);
  expect(logs[0]).toBeGreaterThan(7000);
});

test('login methods enforce persisted auth mode',async()=>{
  const previousFetch=globalThis.fetch;
  const previousJwtSecret=process.env.JWT_SECRET;
  const previousCredentialKey=process.env.FORTRESS_CREDENTIAL_KEY;
  process.env.JWT_SECRET=crypto.randomBytes(48).toString('hex');
  process.env.FORTRESS_CREDENTIAL_KEY=crypto.randomBytes(32).toString('hex');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fortress-auth-mode-'));
  await initDatabase({type:'sqlite',filePath:path.join(dir,'db.sqlite')});
  const app=express();app.use(express.json());app.use('/api/auth',auth);
  const server=app.listen(0,'127.0.0.1');
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Unable to bind test server');
    const base='http://127.0.0.1:'+address.port+'/api/auth';
    await createUser({email:'admin@example.invalid',name:'Admin',role:'admin',auth_type:'sso',github_id:'existing-github-subject'},'correct-dummy-password');
    await createUser({email:'link@example.invalid',name:'Link User',role:'viewer',auth_type:'local'},'link-dummy-password');
    await saveConfig('sso_config',{provider:'github',clientId:'dummy-client',clientSecret:'dummy-secret'});
    await saveConfig('auth_mode','sso');
    const localResponse=await fetch(base+'/login',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:'admin@example.invalid',password:'correct-dummy-password'})
    });
    expect(localResponse.status).toBe(403);
    expect(await localResponse.json()).toEqual({error:'Local authentication is disabled'});

    await saveConfig('auth_mode','local');
    globalThis.fetch=(async(input:any,init:any)=>{
      const url=String(input);
      if(url==='https://github.com/login/oauth/access_token'){
        return new Response(JSON.stringify({access_token:'dummy-token',token_type:'bearer',scope:'user:email'}),{
          status:200,headers:{'Content-Type':'application/json'}
        });
      }
      if(url==='https://api.github.com/user'){
        return new Response(JSON.stringify({id:1001,login:'disabled-user',name:'Disabled User',avatar_url:'https://example.invalid/disabled.png'}),{
          status:200,headers:{'Content-Type':'application/json'}
        });
      }
      if(url==='https://api.github.com/user/emails'){
        return new Response(JSON.stringify([{email:'github@example.invalid',primary:true,verified:true,visibility:'private'}]),{
          status:200,headers:{'Content-Type':'application/json'}
        });
      }
      return previousFetch(input,init);
    }) as typeof fetch;
    const githubResponse=await fetch(base+'/github/callback',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'dummy-code'})
    });
    expect(githubResponse.status).toBe(403);
    expect(await githubResponse.json()).toEqual({error:'GitHub authentication is disabled'});
    expect(await getUserByEmail('github@example.invalid')).toBeNull();

    const linkingLogin=await fetch(base+'/login',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:'link@example.invalid',password:'link-dummy-password'})
    });
    expect(linkingLogin.status).toBe(200);
    const linkingSession=await linkingLogin.json() as any;
    const linkResponse=await fetch(base+'/github/link',{
      method:'POST',headers:{Authorization:'Bearer '+linkingSession.token,'Content-Type':'application/json'},
      body:JSON.stringify({code:'dummy-code'})
    });
    expect(linkResponse.status).toBe(200);
  }finally{
    globalThis.fetch=previousFetch;
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await closeDatabase();fs.rmSync(dir,{recursive:true,force:true});
    if(previousJwtSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousJwtSecret;
    if(previousCredentialKey===undefined)delete process.env.FORTRESS_CREDENTIAL_KEY;else process.env.FORTRESS_CREDENTIAL_KEY=previousCredentialKey;
  }
},30000);

test('a first viewer does not consume the pinned owner bootstrap',async()=>{
  const previousFetch=globalThis.fetch;
  const previousJwtSecret=process.env.JWT_SECRET;
  const previousCredentialKey=process.env.FORTRESS_CREDENTIAL_KEY;
  const previousInitialId=process.env.FORTRESS_INITIAL_SSO_GITHUB_ID;
  process.env.JWT_SECRET=crypto.randomBytes(48).toString('hex');
  process.env.FORTRESS_CREDENTIAL_KEY=crypto.randomBytes(32).toString('hex');
  process.env.FORTRESS_INITIAL_SSO_GITHUB_ID='1002';
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fortress-owner-bootstrap-'));
  await initDatabase({type:'sqlite',filePath:path.join(dir,'db.sqlite')});
  await saveConfig('sso_config',{provider:'github',clientId:'dummy-client',clientSecret:'dummy-secret'});
  const app=express();app.use(express.json());app.use('/api/auth',auth);
  const server=app.listen(0,'127.0.0.1');
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Unable to bind test server');
    const base='http://127.0.0.1:'+address.port+'/api/auth';
    globalThis.fetch=(async(input:any,init:any)=>{
      const url=String(input);
      if(url==='https://github.com/login/oauth/access_token'){
        const body=JSON.parse(String(init?.body));
        const id=body.code==='owner-code'?1002:1001;
        return new Response(JSON.stringify({access_token:'dummy-token-'+id,token_type:'bearer',scope:'user:email'}),{
          status:200,headers:{'Content-Type':'application/json'}
        });
      }
      const authorization=String(init?.headers?.Authorization||'');
      const id=authorization.endsWith('1002')?1002:1001;
      if(url==='https://api.github.com/user'){
        return new Response(JSON.stringify({id,login:id===1002?'owner':'viewer',name:id===1002?'Owner':'Viewer',avatar_url:'https://example.invalid/'+id+'.png'}),{
          status:200,headers:{'Content-Type':'application/json'}
        });
      }
      if(url==='https://api.github.com/user/emails'){
        return new Response(JSON.stringify([{email:(id===1002?'owner':'viewer')+'@example.invalid',primary:true,verified:true,visibility:'private'}]),{
          status:200,headers:{'Content-Type':'application/json'}
        });
      }
      return previousFetch(input,init);
    }) as typeof fetch;
    const githubCallback=(code:string)=>fetch(base+'/github/callback',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})
    });
    expect((await githubCallback('viewer-code')).status).toBe(200);
    expect((await getUserByEmail('viewer@example.invalid'))?.role).toBe('viewer');
    expect((await githubCallback('owner-code')).status).toBe(200);
    expect((await getUserByEmail('owner@example.invalid'))?.role).toBe('admin');
  }finally{
    globalThis.fetch=previousFetch;
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await closeDatabase();fs.rmSync(dir,{recursive:true,force:true});
    if(previousJwtSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousJwtSecret;
    if(previousCredentialKey===undefined)delete process.env.FORTRESS_CREDENTIAL_KEY;else process.env.FORTRESS_CREDENTIAL_KEY=previousCredentialKey;
    if(previousInitialId===undefined)delete process.env.FORTRESS_INITIAL_SSO_GITHUB_ID;else process.env.FORTRESS_INITIAL_SSO_GITHUB_ID=previousInitialId;
  }
},30000);

test('GitHub subject binding requires authenticated linking and rejects duplicate subjects',async()=>{
  const previousFetch=globalThis.fetch;
  const previousJwtSecret=process.env.JWT_SECRET;
  const previousCredentialKey=process.env.FORTRESS_CREDENTIAL_KEY;
  process.env.JWT_SECRET=crypto.randomBytes(48).toString('hex');
  process.env.FORTRESS_CREDENTIAL_KEY=crypto.randomBytes(32).toString('hex');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fortress-github-binding-'));
  await initDatabase({type:'sqlite',filePath:path.join(dir,'db.sqlite')});
  const admin=await createUser({email:'admin@example.invalid',name:'Admin',role:'admin',auth_type:'local'},'correct-dummy-password');
  const second=await createUser({email:'second@example.invalid',name:'Second',role:'viewer',auth_type:'local'},'second-dummy-password');
  await saveConfig('sso_config',{provider:'github',clientId:'dummy-client',clientSecret:'dummy-secret'});
  await saveConfig('auth_mode','sso');
  const app=express();app.use(express.json());app.use('/api/auth',auth);
  const server=app.listen(0,'127.0.0.1');
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Unable to bind test server');
    const base='http://127.0.0.1:'+address.port+'/api/auth';
    globalThis.fetch=(async(input:any,init:any)=>{
      const url=String(input);
      if(url==='https://github.com/login/oauth/access_token'){
        return new Response(JSON.stringify({access_token:'dummy-token',token_type:'bearer',scope:'user:email'}),{
          status:200,headers:{'Content-Type':'application/json'}
        });
      }
      if(url==='https://api.github.com/user'){
        return new Response(JSON.stringify({id:1001,login:'admin',name:'Admin',avatar_url:'https://example.invalid/admin.png'}),{
          status:200,headers:{'Content-Type':'application/json'}
        });
      }
      if(url==='https://api.github.com/user/emails'){
        return new Response(JSON.stringify([{email:'admin@example.invalid',primary:true,verified:true,visibility:'private'}]),{
          status:200,headers:{'Content-Type':'application/json'}
        });
      }
      return previousFetch(input,init);
    }) as typeof fetch;
    const login=(email:string,password:string)=>fetch(base+'/login',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})
    });
    const githubCallback=()=>fetch(base+'/github/callback',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'dummy-code'})
    });
    const githubLink=(token:string)=>fetch(base+'/github/link',{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({code:'dummy-code'})
    });
    const unlinkedCallback=await githubCallback();
    expect(unlinkedCallback.status).toBe(403);
    expect(await unlinkedCallback.json()).toEqual({error:'Account linking required'});
    const adminLogin=await login('admin@example.invalid','correct-dummy-password');
    expect(adminLogin.status).toBe(403);
    const adminProof=await adminLogin.json() as any;
    expect(adminProof.error).toBe('Account linking required');
    expect(adminProof.token).toBeUndefined();
    const linkResponse=await githubLink(adminProof.linkToken);
    expect(linkResponse.status).toBe(200);
    expect((await getUserByEmail('admin@example.invalid'))?.github_id).toBe('1001');
    const boundCallback=await githubCallback();
    expect(boundCallback.status).toBe(200);
    const boundBody=await boundCallback.json() as any;
    expect(boundBody.user.id).toBe(admin.id);
    expect(typeof boundBody.token).toBe('string');
    expect((await login('admin@example.invalid','correct-dummy-password')).status).toBe(403);
    const secondLogin=await login('second@example.invalid','second-dummy-password');
    expect(secondLogin.status).toBe(403);
    const secondProof=await secondLogin.json() as any;
    expect(secondProof.token).toBeUndefined();
    const secondLinkResponse=await githubLink(secondProof.linkToken);
    expect(secondLinkResponse.status).toBe(409);
    expect((await getUserByEmail('second@example.invalid'))?.github_id).toBeNull();
    expect((await getUserByEmail('admin@example.invalid'))?.github_id).toBe('1001');
  }finally{
    globalThis.fetch=previousFetch;
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await closeDatabase();fs.rmSync(dir,{recursive:true,force:true});
    if(previousJwtSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousJwtSecret;
    if(previousCredentialKey===undefined)delete process.env.FORTRESS_CREDENTIAL_KEY;else process.env.FORTRESS_CREDENTIAL_KEY=previousCredentialKey;
  }
},30000);

test('API client preserves 403 policy responses and expires 401 sessions',async()=>{
  const previousFetch=globalThis.fetch;
  const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  const values=new Map<string,string>();
  const requests:string[]=[];
  let responseStatus=403;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:(key:string)=>values.get(key)??null,
    setItem:(key:string,value:string)=>{values.set(key,String(value))},
    removeItem:(key:string)=>{values.delete(key)}
  }});
  Object.defineProperty(globalThis,'window',{configurable:true,value:{
    location:{pathname:'/settings',href:'/settings',reload:()=>{}}
  }});
  globalThis.fetch=(async(input:any)=>{
    const url=String(input);requests.push(url);
    if(url==='/api/auth/logout'){
      return new Response(JSON.stringify({success:true}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    return new Response(JSON.stringify({error:responseStatus===403?'Account linking required':'Invalid token'}),{
      status:responseStatus,headers:{'Content-Type':'application/json'}
    });
  }) as typeof fetch;
  try{
    const api=await import('../client/api/index.ts');
    api.setToken('current-session');
    const policyResponse=await api.apiFetch('/systems');
    expect(policyResponse).toEqual({error:'Account linking required'});
    expect(api.getToken()).toBe('current-session');
    expect(requests).toEqual(['/api/systems']);
    expect(window.location.href).toBe('/settings');
    expect(typeof api.githubLink).toBe('function');

    responseStatus=401;
    const expiredResponse=await api.apiFetch('/systems');
    expect(expiredResponse).toEqual({error:'Session expired'});
    expect(api.getToken()).toBeNull();
    expect(requests).toEqual(['/api/systems','/api/systems','/api/auth/logout']);
    expect(window.location.href).toBe('/');
  }finally{
    globalThis.fetch=previousFetch;
    if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);
    else Reflect.deleteProperty(globalThis,'localStorage');
    if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);
    else Reflect.deleteProperty(globalThis,'window');
  }
});

test('logout revokes bearer tokens',async()=>{
  const previousJwtSecret=process.env.JWT_SECRET;
  process.env.JWT_SECRET=crypto.randomBytes(48).toString('hex');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fortress-token-revocation-'));
  await initDatabase({type:'sqlite',filePath:path.join(dir,'db.sqlite')});
  await run('INSERT INTO users(id,email,name,role,auth_type) VALUES(?,?,?,?,?)',['admin','admin@example.invalid','Admin','admin','local']);
  const app=express();app.use(express.json());app.use('/api/systems',systems);app.use('/api/auth',auth);
  const server=app.listen(0,'127.0.0.1');
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Unable to bind test server');
    const base='http://127.0.0.1:'+address.port+'/api';
    const token=jwt.sign({id:'admin',role:'admin',authEpoch:0},process.env.JWT_SECRET);
    const incorrectEpoch=jwt.sign({id:'admin',role:'admin',authEpoch:1},process.env.JWT_SECRET);
    const authorizedRequest=(token:string)=>fetch(base+'/systems',{headers:{Authorization:'Bearer '+token}});
    expect((await authorizedRequest(token)).status).toBe(200);
    expect((await authorizedRequest(incorrectEpoch)).status).toBe(401);
    expect((await fetch(`${base}/auth/logout`,{method:'POST',headers:{Authorization:`Bearer ${token}`}})).status).toBe(200);
    expect((await authorizedRequest(token)).status).toBe(401);
  }finally{
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await closeDatabase();fs.rmSync(dir,{recursive:true,force:true});
    if(previousJwtSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousJwtSecret;
  }
},30000);

test('login admission limits each IP and resets after its window',async()=>{
  const {createAdmissionLimiter}=await import('../server/middleware/admission.js');
  let now=0;
  let nextCalls=0;
  const limiter=createAdmissionLimiter({limit:10,windowMs:60_000,now:()=>now});
  const invoke=(ip:string)=>{
    const res={statusCode:200,body:undefined as unknown,
      status(code:number){this.statusCode=code;return this},
      json(body:unknown){this.body=body;return this}
    };
    limiter({ip,route:{path:'/login'}} as any,res as any,()=>{nextCalls++});
    return res;
  };
  for(let i=0;i<10;i++)expect(invoke('203.0.113.10').statusCode).toBe(200);
  expect(nextCalls).toBe(10);
  expect(invoke('203.0.113.10').statusCode).toBe(429);
  expect(nextCalls).toBe(10);
  expect(invoke('203.0.113.11').statusCode).toBe(200);
  expect(nextCalls).toBe(11);
  now=60_000;
  expect(invoke('203.0.113.10').statusCode).toBe(200);
  expect(nextCalls).toBe(12);
});

test('login admission deletes expired buckets before evicting active clients',async()=>{
  const {createAdmissionLimiter}=await import('../server/middleware/admission.js');
  let now=100;
  let nextCalls=0;
  const limiter=createAdmissionLimiter({limit:2,windowMs:100,now:()=>now});
  const invoke=(ip:string)=>{
    const res={statusCode:200,status(code:number){this.statusCode=code;return this},json(){return this}};
    limiter({ip,route:{path:'/login'}} as any,res as any,()=>{nextCalls++});
    return res;
  };
  invoke('203.0.113.10');
  now=0;
  for(let i=0;i<9_999;i++)invoke(`198.51.100.${i}`);
  now=100;
  invoke('192.0.2.1');
  invoke('203.0.113.10');
  now=101;
  expect(invoke('203.0.113.10').statusCode).toBe(429);
  expect(nextCalls).toBe(10_002);
});

test('bounded JSON fetching refuses redirects and parses bounded responses',async()=>{
  const {fetchJsonWithLimits}=await import('../server/utils/http.js');
  const previousFetch=globalThis.fetch;
  let requestInit:RequestInit|undefined;
  globalThis.fetch=(async(_input:any,init:any)=>{
    requestInit=init;
    return new Response(JSON.stringify({id:1001}),{status:200,headers:{'Content-Type':'application/json'}});
  }) as typeof fetch;
  try{
    const result=await fetchJsonWithLimits('https://provider.invalid/user',{redirect:'follow'},{timeoutMs:100,maxBytes:1024});
    expect(requestInit?.redirect).toBe('error');
    expect(result).toEqual({status:200,ok:true,data:{id:1001}});
  }finally{
    globalThis.fetch=previousFetch;
  }
});

test('bounded JSON fetching aborts a pending request on the caller signal',async()=>{
  const {fetchJsonWithLimits}=await import('../server/utils/http.js');
  const previousFetch=globalThis.fetch;
  globalThis.fetch=(async(_input:any,init:any)=>new Promise((_resolve,reject)=>{
    init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});
  })) as typeof fetch;
  const controller=new AbortController();
  try{
    const request=fetchJsonWithLimits('https://provider.invalid/user',{},{
      timeoutMs:1000,maxBytes:1024,signal:controller.signal
    });
    controller.abort(new Error('client aborted'));
    await expect(request).rejects.toThrow('aborted');
  }finally{
    globalThis.fetch=previousFetch;
  }
});

test('bounded JSON fetching aborts a pending request at its deadline',async()=>{
  const {fetchJsonWithLimits}=await import('../server/utils/http.js');
  const previousFetch=globalThis.fetch;
  globalThis.fetch=(async(_input:any,init:any)=>new Promise((_resolve,reject)=>{
    init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});
  })) as typeof fetch;
  try{
    await expect(fetchJsonWithLimits('https://provider.invalid/user',{},{
      timeoutMs:10,maxBytes:1024
    })).rejects.toThrow('timed out');
  }finally{
    globalThis.fetch=previousFetch;
  }
});

test('bounded JSON fetching rejects an oversized streamed body',async()=>{
  const {fetchJsonWithLimits}=await import('../server/utils/http.js');
  const previousFetch=globalThis.fetch;
  const encoder=new TextEncoder();
  globalThis.fetch=(async(_input:any)=>new Response(new ReadableStream({
    start(controller){
      controller.enqueue(encoder.encode('{"ok":'));
      controller.enqueue(encoder.encode('true}'));
      controller.close();
    }
  }),{status:200,headers:{'Content-Type':'application/json'}})) as typeof fetch;
  try{
    await expect(fetchJsonWithLimits('https://provider.invalid/user',{},{
      timeoutMs:100,maxBytes:8
    })).rejects.toThrow('exceeds 8 bytes');
  }finally{
    globalThis.fetch=previousFetch;
  }
});

test('bounded JSON fetching cancels GitHub OAuth when the client disconnects',async()=>{
  const previousFetch=globalThis.fetch;
  const previousCredentialKey=process.env.FORTRESS_CREDENTIAL_KEY;
  process.env.FORTRESS_CREDENTIAL_KEY=crypto.randomBytes(32).toString('hex');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fortress-oauth-disconnect-'));
  await initDatabase({type:'sqlite',filePath:path.join(dir,'db.sqlite')});
  await saveConfig('sso_config',{provider:'github',clientId:'dummy-client',clientSecret:'dummy-secret'});
  await saveConfig('auth_mode','sso');
  let markStarted!:()=>void;
  const providerStarted=new Promise<void>(resolve=>{markStarted=resolve});
  let providerSignal:AbortSignal|undefined;
  globalThis.fetch=(async(input:any,init:any)=>{
    if(!String(input).startsWith('https://github.com/'))return previousFetch(input,init);
    providerSignal=init?.signal;
    markStarted();
    return new Promise((_resolve,reject)=>{
      if(init?.signal?.aborted){reject(init.signal.reason);return;}
      init?.signal?.addEventListener('abort',()=>reject(init.signal.reason),{once:true});
    });
  }) as typeof fetch;
  const app=express();app.use(express.json());app.use('/api/auth',auth);
  const server=app.listen(0,'127.0.0.1');
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Unable to bind test server');
    const controller=new AbortController();
    const request=fetch('http://127.0.0.1:'+address.port+'/api/auth/github/callback',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'dummy-code'}),
      signal:controller.signal
    });
    await providerStarted;
    controller.abort();
    await expect(request).rejects.toThrow();
    const disconnected=await Promise.race([
      (async()=>{while(!providerSignal?.aborted)await Bun.sleep(5);return true})(),
      Bun.sleep(100).then(()=>false)
    ]);
    expect(disconnected).toBe(true);
  }finally{
    globalThis.fetch=previousFetch;
    await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections()});
    await closeDatabase();fs.rmSync(dir,{recursive:true,force:true});
    if(previousCredentialKey===undefined)delete process.env.FORTRESS_CREDENTIAL_KEY;else process.env.FORTRESS_CREDENTIAL_KEY=previousCredentialKey;
  }
});

test('OpenAI-compatible request policy refuses redirects',async()=>{
  const {generateBackupConfig}=await import('../server/services/ai/generator.js');
  const {AIProvider}=await import('../types.js');
  const previousFetch=globalThis.fetch;
  let requestInit:RequestInit|undefined;
  globalThis.fetch=(async(_input:any,init:any)=>{
    requestInit=init;
    if(init?.redirect==='error')throw new Error('redirect blocked');
    return new Response(JSON.stringify({choices:[{message:{content:'{}'}}]}),{
      status:200,headers:{'Content-Type':'application/json'}
    });
  }) as typeof fetch;
  try{
    await expect(generateBackupConfig('dummy prompt',{
      provider:AIProvider.OPENAI,baseUrl:'https://api.openai.com/v1',apiKey:'dummy-key',model:'dummy-model'
    })).rejects.toThrow('redirect');
    expect(requestInit?.redirect).toBe('error');
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
  }finally{
    globalThis.fetch=previousFetch;
  }
});

test('OpenAI-compatible request policy caps streamed responses at 1 MiB',async()=>{
  const {generateBackupConfig}=await import('../server/services/ai/generator.js');
  const {AIProvider}=await import('../types.js');
  const previousFetch=globalThis.fetch;
  const encoder=new TextEncoder();
  globalThis.fetch=(async(_input:any)=>new Response(new ReadableStream({
    start(controller){
      controller.enqueue(encoder.encode(' '.repeat(1_048_576)));
      controller.enqueue(encoder.encode('{}'));
      controller.close();
    }
  }),{status:200,headers:{'Content-Type':'application/json'}})) as typeof fetch;
  try{
    await expect(generateBackupConfig('dummy prompt',{
      provider:AIProvider.OPENAI,baseUrl:'https://api.openai.com/v1',apiKey:'dummy-key',model:'dummy-model'
    })).rejects.toThrow('exceeds 1048576 bytes');
  }finally{
    globalThis.fetch=previousFetch;
  }
});

test('OpenAI-compatible request policy aborts at 30 seconds',async()=>{
  const {jest}=await import('bun:test');
  const {generateBackupConfig}=await import('../server/services/ai/generator.js');
  const {AIProvider}=await import('../types.js');
  const previousFetch=globalThis.fetch;
  let requestInit:RequestInit|undefined;
  jest.useFakeTimers();
  globalThis.fetch=(async(_input:any,init:any)=>{
    requestInit=init;
    return new Promise((_resolve,reject)=>{
      init?.signal?.addEventListener('abort',()=>reject(init.signal.reason),{once:true});
    });
  }) as typeof fetch;
  try{
    const request=generateBackupConfig('dummy prompt',{
      provider:AIProvider.OPENAI,baseUrl:'https://api.openai.com/v1',apiKey:'dummy-key',model:'dummy-model'
    });
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
    jest.advanceTimersByTime(29_999);
    expect(requestInit?.signal?.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    expect(requestInit?.signal?.aborted).toBe(true);
    await expect(request).rejects.toThrow('timed out');
  }finally{
    jest.useRealTimers();
    globalThis.fetch=previousFetch;
  }
});

test('OpenAI-compatible request policy cancels generation when the client disconnects',async()=>{
  const previousFetch=globalThis.fetch;
  const previousJwtSecret=process.env.JWT_SECRET;
  const previousCredentialKey=process.env.FORTRESS_CREDENTIAL_KEY;
  process.env.JWT_SECRET=crypto.randomBytes(48).toString('hex');
  process.env.FORTRESS_CREDENTIAL_KEY=crypto.randomBytes(32).toString('hex');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fortress-ai-disconnect-'));
  await initDatabase({type:'sqlite',filePath:path.join(dir,'db.sqlite')});
  await run('INSERT INTO users(id,email,name,role,auth_type) VALUES(?,?,?,?,?)',['admin','admin@example.invalid','Admin','admin','local']);
  const {AIProvider}=await import('../types.js');
  await saveConfig('ai_config',{provider:AIProvider.OPENAI,baseUrl:'https://api.openai.com/v1',apiKey:'dummy-key',model:'dummy-model'});
  let markStarted!:()=>void;
  const providerStarted=new Promise<void>(resolve=>{markStarted=resolve});
  let providerSignal:AbortSignal|undefined;
  globalThis.fetch=(async(input:any,init:any)=>{
    if(!String(input).startsWith('https://api.openai.com/'))return previousFetch(input,init);
    providerSignal=init?.signal;
    markStarted();
    return new Promise((_resolve,reject)=>{
      if(init?.signal?.aborted){reject(init.signal.reason);return;}
      init?.signal?.addEventListener('abort',()=>reject(init.signal.reason),{once:true});
    });
  }) as typeof fetch;
  const app=express();app.use(express.json());app.use('/api/ai',ai);
  const server=app.listen(0,'127.0.0.1');
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Unable to bind test server');
    const controller=new AbortController();
    const token=jwt.sign({id:'admin',role:'admin',authEpoch:0},process.env.JWT_SECRET);
    const request=fetch('http://127.0.0.1:'+address.port+'/api/ai/generate',{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({prompt:'dummy prompt'}),signal:controller.signal
    });
    await providerStarted;
    controller.abort();
    await expect(request).rejects.toThrow();
    const disconnected=await Promise.race([
      (async()=>{while(!providerSignal?.aborted)await Bun.sleep(5);return true})(),
      Bun.sleep(100).then(()=>false)
    ]);
    expect(disconnected).toBe(true);
  }finally{
    globalThis.fetch=previousFetch;
    await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections()});
    await closeDatabase();fs.rmSync(dir,{recursive:true,force:true});
    if(previousJwtSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousJwtSecret;
    if(previousCredentialKey===undefined)delete process.env.FORTRESS_CREDENTIAL_KEY;else process.env.FORTRESS_CREDENTIAL_KEY=previousCredentialKey;
  }
});
