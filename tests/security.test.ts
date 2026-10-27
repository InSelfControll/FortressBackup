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
import { getLocation } from '../server/db/locations.js';
import { sshHostVerifier } from '../server/services/ssh/hostKey.js';
import { buildBorgCommand, buildBorgRestoreCommand } from '../server/services/backup/borg.js';
import { buildResticCommand } from '../server/services/backup/restic.js';

test('privileged APIs deny viewers and never echo stored credentials', async()=>{
 process.env.JWT_SECRET='security-tests-signed-jwt-'+crypto.randomBytes(24).toString('hex');
 process.env.FORTRESS_CREDENTIAL_KEY=crypto.randomBytes(32).toString('hex');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fortress-security-'));
 await initDatabase({type:'sqlite',filePath:path.join(dir,'db.sqlite')});
 const app=express(); app.use(express.json());
 app.use('/api/jobs',jobs);app.use('/api/systems',systems);
 app.use('/api/locations',locations);app.use('/api/keys',keys);
 const server=app.listen(0,'127.0.0.1');
 try{
  const a=server.address();if(!a||typeof a==='string')throw Error('bind failed');
  const base='http://127.0.0.1:'+a.port+'/api';
  const viewer=jwt.sign({id:'viewer',role:'viewer'},process.env.JWT_SECRET);
  const admin=jwt.sign({id:'admin',role:'admin'},process.env.JWT_SECRET);
  const request=(route:string,token:string,method='GET',body?:unknown)=>fetch(base+route,{
   method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:body===undefined?undefined:JSON.stringify(body)
  });
  for(const route of ['/jobs','/systems','/locations','/keys']){
   expect((await request(route,viewer)).status).toBe(403);
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
 const restore=buildBorgRestoreCommand({...config,tool:'borg',destinationType:'nfs',destinationPath:'/safe/repo'},'backup-2026','/tmp/restore');
 expect(restore).not.toContain('exit 0');
});
