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
import { saveConfig, getConfig } from '../server/db/config.js';
import { sshHostVerifier } from '../server/services/ssh/hostKey.js';
import { buildBorgCommand, buildBorgRestoreCommand } from '../server/services/backup/borg.js';
import { buildResticCommand } from '../server/services/backup/restic.js';
import { buildRsyncCommand } from '../server/services/backup/rsync.js';

test('privileged APIs deny viewers and never echo stored credentials', async()=>{
 process.env.JWT_SECRET='security-tests-signed-jwt-'+crypto.randomBytes(24).toString('hex');
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
  const viewer=jwt.sign({id:'viewer',role:'viewer'},process.env.JWT_SECRET);
  const admin=jwt.sign({id:'admin',role:'admin'},process.env.JWT_SECRET);
  const staleRole=jwt.sign({id:'viewer',role:'admin'},process.env.JWT_SECRET);
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
 const config:any={tool:'restic',destinationType:'sftp',destinationPath:'host:repo',
  sourcePaths:['/home/test user'],repoPassword:'test-only',jobName:'backup'};
 const cmd=buildResticCommand(config);
 expect(cmd).toContain(' -- ');
 expect(()=>buildResticCommand({...config,sourcePaths:['--help']})).toThrow();
 expect(()=>buildResticCommand({...config,sourcePaths:['/etc/../root']})).toThrow();
 expect(()=>buildResticCommand({...config,sourcePaths:['/tmp/bad\nname']})).toThrow();
 const borg=buildBorgCommand({...config,tool:'borg',destinationType:'nfs',destinationPath:'/safe/repo'});
 expect(borg).not.toContain('rm -rf');
 expect(borg).not.toContain('borg init');
 expect(borg).not.toContain('borg prune');
 const rsync={...config,tool:'rsync',destinationPath:'/tmp/restic-safe',sourcePaths:['/home/docs']};
 const ssh:any={username:'backup',host:'backup.example.net',port:22,hostFingerprint:fp};
 const rsyncCommand=buildRsyncCommand(rsync,ssh,true);
 expect(rsyncCommand).toContain('StrictHostKeyChecking=yes');
 expect(rsyncCommand).toContain('UserKnownHostsFile=/etc/fortress/known_hosts');
 expect(rsyncCommand).not.toContain('StrictHostKeyChecking=no');
 expect(()=>buildRsyncCommand({...rsync,sourcePaths:['/tmp/;touch /tmp/owned']},ssh,true)).toThrow();
 expect(()=>buildRsyncCommand(rsync,{...ssh,host:'example.net; echo injected'},true)).toThrow();
 expect(()=>buildRsyncCommand(rsync,{...ssh,hostFingerprint:''},true)).toThrow();
 const restore=buildBorgRestoreCommand({...config,tool:'borg',destinationType:'nfs',destinationPath:'/safe/repo'},'backup-2026','/tmp/restore');
 expect(restore).not.toContain('exit 0');
});
