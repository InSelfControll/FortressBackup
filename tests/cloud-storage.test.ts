import {test,expect} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import locations from '../server/routes/locations.js';
import jobs from '../server/routes/jobs.js';
import {initDatabase,closeDatabase} from '../server/db/connection.js';
import {run,getOne} from '../server/db/helpers.js';
import {getLocation} from '../server/db/locations.js';
import {saveJob} from '../server/db/jobs.js';
import {encrypt} from '../server/encryption.js';
import {managedRepository} from '../server/services/managedRepository.js';
import {azureRepository,driveConfig,rcloneConfig,gcsCredentials} from '../server/services/backup/cloudStorage.js';
import {buildResticCommand,buildResticSnapshotListCommand,buildResticFileListCommand,buildResticRestoreCommand} from '../server/services/backup/restic.js';
const token=JSON.stringify({access_token:'disposable-access',refresh_token:'disposable-refresh',token_type:'Bearer',expiry:'2020-01-01T00:00:00Z'});
const config=`[drive]\ntype = drive\ntoken = ${token}\n[unrelated]\ntype = local\n`;
const oneConfig=`[drive]\ntype = onedrive\ndrive_id = b!test-drive\ndrive_type = personal\ntoken = ${token}\n`;
const googleUser=JSON.stringify({type:'authorized_user',client_id:'test.apps.googleusercontent.com',client_secret:'test-secret',refresh_token:'test-refresh'});
const azureKey=Buffer.alloc(64,19).toString('base64');

test('Drive import keeps only the selected OAuth remote and rejects executable/external configuration',()=>{
 const normalized=driveConfig('drive:folder',config);
 expect(driveConfig('drive:folder',config.replace('type = drive','type = drive\nservice_account_file = '))).toBe(normalized);
 expect(normalized).toContain('[drive]');expect(normalized).not.toContain('unrelated');
 for(const bad of [config.replace('type = drive','type = local'),config.replace(token,'{}'),config+'[drive]\ntype=drive',config.replace('type = drive','type = drive\npassword_command = bad'),config.replace('type = drive','type = drive\nservice_account_file = C:\\credentials.json')])expect(()=>driveConfig('drive:folder',bad)).toThrow();
 for(const target of ['drive:../escape',':drive:folder','drive:folder\ncommand'])expect(()=>driveConfig(target,config)).toThrow();
 expect(()=>azureRepository({destinationPath:'BadContainer',destinationAccessKey:'testaccount',destinationSecretKey:azureKey})).toThrow();
});

test('Linux backup/list/files/restore share cloud targets and safely clean temporary credentials',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'fortress-cloud-command-'));
 try{
  fs.writeFileSync(path.join(directory,'rclone'),'#!/bin/sh\nexit 0\n',{mode:0o700});
  fs.writeFileSync(path.join(directory,'restic'),`#!/usr/bin/env bun
import fs from 'node:fs';
const file=process.env.RCLONE_CONFIG||process.env.GOOGLE_APPLICATION_CREDENTIALS;
if(file)fs.writeFileSync(file+'.old','disposable token-refresh backup');
console.log(JSON.stringify({args:process.argv.slice(2),account:process.env.AZURE_ACCOUNT_NAME,key:process.env.AZURE_ACCOUNT_KEY,config:file?fs.readFileSync(file,'utf8'):null,mode:file?(fs.statSync(file).mode&511):null,file}));
`,{mode:0o700});
  for(const backend of ['azure','gdrive','onedrive','gcs'] as const){
   const c={jobId:'test',jobName:'test',tool:'restic' as const,sourcePaths:['/home/test'],repoPassword:"secret ' ; $(false)",destinationType:backend,destinationPath:backend==='azure'?'backup-container':backend==='gcs'?'backup-bucket':"drive:folder ' $(false)",destinationRegion:'laptop',destinationAccessKey:'testaccount',destinationSecretKey:backend==='azure'?azureKey:backend==='gcs'?googleUser:backend==='onedrive'?oneConfig:config};
   for(const command of [buildResticCommand(c),buildResticSnapshotListCommand(c),buildResticFileListCommand(c,'abcdef12'),buildResticRestoreCommand(c,'abcdef12','/tmp/restore')]){
    const result=Bun.spawnSync(['sh','-s'],{stdin:Buffer.from(command),env:{...process.env,PATH:`${directory}:${process.env.PATH}`}});
    expect(result.exitCode).toBe(0);
    const actual=JSON.parse(result.stdout.toString());
    expect(actual.args).toContain(backend==='azure'?'azure:backup-container:/laptop':backend==='gcs'?'gs:backup-bucket:/laptop':"rclone:drive:folder ' $(false)");
    if(backend==='azure'){expect(actual.account).toBe('testaccount');expect(actual.key).toBe(azureKey)}
    else {expect(actual.config).toBe(backend==='gcs'?gcsCredentials(googleUser):rcloneConfig(backend,c.destinationPath,c.destinationSecretKey));expect(actual.mode).toBe(0o600);expect(fs.existsSync(path.dirname(actual.file))).toBe(false)}
   }
  }
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
});

test('cloud CRUD encrypts credentials, retains them on edit and provisions the assigned Windows repository',async()=>{
 const previous={jwt:process.env.JWT_SECRET,key:process.env.FORTRESS_CREDENTIAL_KEY};
 const signing=crypto.randomBytes(48).toString('hex');process.env.JWT_SECRET=signing;process.env.FORTRESS_CREDENTIAL_KEY=crypto.randomBytes(32).toString('hex');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'fortress-cloud-api-'));
 await initDatabase({type:'sqlite',filePath:path.join(directory,'test.db')});
 const app=express();app.use(express.json());app.use('/locations',locations);app.use('/jobs',jobs);
 const server=app.listen(0,'127.0.0.1');
 try{
  await run('INSERT INTO users(id,email,name,role,auth_type) VALUES(?,?,?,?,?)',['admin','admin@example.invalid','Admin','admin','local']);
  const base='http://127.0.0.1:'+(server.address() as any).port+'/locations';
  const auth=jwt.sign({id:'admin',role:'admin',authEpoch:0},signing);
  const request=async(route:string,body:any,method='POST')=>{const response=await fetch(base+route,{method,headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json() as any}};
  for(const type of ['azure','gdrive','gcs','onedrive']){
   const body={name:'Cloud '+type,type,path:type==='azure'?'backup-container':type==='gcs'?'backup-bucket':'drive:backups',region:'laptop',access_key:type==='azure'?'testaccount':undefined,secret_key:type==='azure'?azureKey:type==='gcs'?googleUser:type==='onedrive'?oneConfig:config};
   const created=await request('',body);expect(created.status).toBe(200);expect(created.data.hasSecretKey).toBe(true);expect(created.data).not.toHaveProperty('secret_key');
   const raw=await getOne<any>('SELECT secret_key FROM locations WHERE id=?',[created.data.id]);expect(raw.secret_key).not.toContain(type==='azure'?azureKey:'disposable-refresh');
   const edited=await request('/'+created.data.id,{...body,secret_key:undefined,access_key:undefined,name:'Edited cloud'},'PUT');expect(edited.status).toBe(200);
   const saved=await getLocation(created.data.id);expect(saved?.secret_key).toBe(type==='azure'?azureKey:type==='gcs'?gcsCredentials(googleUser):rcloneConfig(type as 'gdrive'|'onedrive',body.path,body.secret_key));
   const jobId=crypto.randomUUID();await saveJob({id:jobId,name:'Cloud job',tool:'Restic',destination_id:created.data.id,repo_password:JSON.stringify(encrypt('test-encryption-password',signing)),status:'Idle',priority:'Medium'});
   const profile=await managedRepository(jobId);expect(profile.backend).toBe(type);expect(profile.password).toBe('test-encryption-password');expect(profile).not.toHaveProperty('sshPrivateKey');
   if(type==='azure'){expect(profile.repository).toBe('azure:backup-container:/laptop');expect((profile as any).azureAccountKey).toBe(azureKey)}else if(type==='gcs'){expect(profile.repository).toBe('gs:backup-bucket:/laptop');expect((profile as any).gcsCredentials).toBe(gcsCredentials(googleUser))}else expect((profile as any).rcloneConfig).toBe(rcloneConfig(type as 'gdrive'|'onedrive',body.path,body.secret_key));
  }
  // Identical Azure container URIs/passwords on different accounts must not
  // allow cross-device recovery to the wrong assigned storage location.
  const source=await request('',{name:'Account one',type:'azure',path:'same-container',access_key:'accountone',secret_key:azureKey});
  const target=await request('',{name:'Account two',type:'azure',path:'same-container',access_key:'accounttwo',secret_key:azureKey});
  const ids=[crypto.randomUUID(),crypto.randomUUID()];
  for(let i=0;i<2;i++)await saveJob({id:ids[i],name:'Account '+i,tool:'Restic',destination_id:[source,target][i].data.id,repo_password:JSON.stringify(encrypt('same-repo-password',signing)),status:'Idle',priority:'Medium'});
  const clientId=crypto.randomUUID();
  await run('INSERT INTO managed_clients(id,name,token_hash,created_at) VALUES(?,?,?,?)',[clientId,'New device','test-only',new Date().toISOString()]);
  await run('INSERT INTO managed_repositories(client_id,job_id) VALUES(?,?)',[clientId,ids[1]]);
  const rejected=await fetch(base.replace('/locations','/jobs/')+ids[0]+'/restore',{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify({managedAgentId:clientId,snapshotId:'a'.repeat(64)})});
  expect(rejected.status).toBe(409);expect((await rejected.json() as any).error).toContain('different repository');
  expect((await request('',{name:'Bad',type:'gdrive',path:'drive:backups',secret_key:config.replace('type = drive','type = drive\npassword_command = bad')})).status).toBe(400);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await closeDatabase();fs.rmSync(directory,{recursive:true,force:true});for(const [name,value] of Object.entries({JWT_SECRET:previous.jwt,FORTRESS_CREDENTIAL_KEY:previous.key})){if(value===undefined)delete process.env[name];else process.env[name]=value}}
});

test('cloud connection checks use protected files/environment and hide provider error output',async()=>{
 const {checkCloudLocation}=await import('../server/services/connectionChecks.js');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'fortress-cloud-probe-'));
 const originalPath=process.env.PATH;
 try{
  const capture=path.join(directory,'capture.json');
  fs.writeFileSync(path.join(directory,'rclone'),`#!/usr/bin/env bun
import fs from 'node:fs';
const file=process.env.RCLONE_CONFIG||process.env.GOOGLE_APPLICATION_CREDENTIALS;
fs.writeFileSync(${JSON.stringify(capture)},JSON.stringify({args:process.argv.slice(2),file,config:fs.existsSync(file)?fs.readFileSync(file,'utf8'):null,key:process.env.RCLONE_AZUREBLOB_KEY}));
if(process.argv.includes('drive:failure')){console.error('private provider token: disposable-refresh');process.exit(1)}
`,{mode:0o700});
  process.env.PATH=`${directory}:${originalPath}`;
  await checkCloudLocation({id:'probe',name:'Drive',type:'gdrive',path:'drive:backups',secret_key:config});
  let result=JSON.parse(fs.readFileSync(capture,'utf8'));expect(result.args).toEqual(['lsf','drive:backups','--max-depth','1','--retries','1','--low-level-retries','1','--contimeout','8s','--timeout','15s']);expect(result.config).toBe(driveConfig('drive:backups',config));expect(fs.existsSync(path.dirname(result.file))).toBe(false);
  await checkCloudLocation({id:'probe',name:'Azure',type:'azure',path:'backups',region:'laptop',access_key:'testaccount',secret_key:azureKey});
  result=JSON.parse(fs.readFileSync(capture,'utf8'));expect(result.args[1]).toBe(':azureblob:backups/laptop');expect(result.key).toBe(azureKey);expect(result.args.join(' ')).not.toContain(azureKey);
  for(const [type,credentials] of [['gcs',googleUser],['onedrive',oneConfig]]){
   await checkCloudLocation({id:'probe',name:'Cloud',type,path:type==='gcs'?'backup-bucket':'drive:backups',region:'laptop',secret_key:credentials});
   result=JSON.parse(fs.readFileSync(capture,'utf8'));expect(result.args[1]).toBe(type==='gcs'?'fortress:backup-bucket/laptop':'drive:backups');expect(result.config).toContain(type==='gcs'?'type = google cloud storage':'type = onedrive');expect(result.args.join(' ')).not.toContain('refresh');expect(fs.existsSync(path.dirname(result.file))).toBe(false);
  }
  await expect(checkCloudLocation({id:'probe',name:'Drive',type:'gdrive',path:'drive:failure',secret_key:config})).rejects.toThrow('Cloud authentication or folder access failed');
 }finally{if(originalPath===undefined)delete process.env.PATH;else process.env.PATH=originalPath;fs.rmSync(directory,{recursive:true,force:true})}
});

test('GCS and OneDrive reject unsafe credentials and resolve all Restic commands',async()=>{
 const {rcloneConfig,gcsCredentials,gcsRepository}=await import('../server/services/backup/cloudStorage.js');
 const one=`[one]\ntype = onedrive\ndrive_id = b!drive-id\ndrive_type = personal\ntoken = ${token}\n`;
 expect(rcloneConfig('onedrive','one:backup',one)).toContain('drive_id = b!drive-id');
 expect(()=>rcloneConfig('onedrive','one:backup',one.replace('drive_type = personal','drive_type = unknown'))).toThrow();
 expect(()=>rcloneConfig('onedrive','one:backup',one+'password_command = bad\n')).toThrow();
 const serviceKey=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
 const service=JSON.stringify({type:'service_account',project_id:'test-project',client_email:'backup@test-project.iam.gserviceaccount.com',private_key:serviceKey,token_uri:'https://oauth2.googleapis.com/token'});
 expect(JSON.parse(gcsCredentials(service)).private_key).toBe(serviceKey);
 expect(()=>gcsCredentials(service.replace('https://oauth2.googleapis.com/token','https://attacker.example.invalid/token'))).toThrow();
 expect(()=>gcsCredentials('{"type":"external_account","credential_source":{"executable":{"command":"bad"}}}')).toThrow();
 const user=JSON.stringify({type:'authorized_user',client_id:'test.apps.googleusercontent.com',client_secret:'test-secret',refresh_token:'test-refresh'});
 expect(gcsRepository({destinationPath:'backup-bucket',destinationRegion:'laptop',destinationSecretKey:user})).toBe('gs:backup-bucket:/laptop');
 const base={jobId:'job',jobName:'job',tool:'restic' as const,sourcePaths:['/home/test'],repoPassword:'test'};
 for(const c of [{...base,destinationType:'gcs' as const,destinationPath:'backup-bucket',destinationSecretKey:user},{...base,destinationType:'onedrive' as const,destinationPath:'one:backup',destinationSecretKey:one}]){
  for(const command of [buildResticCommand(c),buildResticSnapshotListCommand(c),buildResticFileListCommand(c,'abcdef12'),buildResticRestoreCommand(c,'abcdef12','/tmp/restore')]){
   expect(command).toContain(c.destinationType==='gcs'?'GOOGLE_APPLICATION_CREDENTIALS=':'RCLONE_CONFIG=');
   expect(command).toContain(c.destinationType==='gcs'?'gs:backup-bucket:/':'rclone:one:backup');
  }
 }
});
