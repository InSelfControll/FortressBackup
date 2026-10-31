import {test,expect} from 'bun:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';
import {Server, utils as sshUtils} from 'ssh2';
import * as db from '../server/db/index';
import auth from '../server/routes/auth';
import systems from '../server/routes/systems';
import locations from '../server/routes/locations';
import jobs from '../server/routes/jobs';
import keys from '../server/routes/sshKeys';
import config from '../server/routes/config';
import {checkSFTPLocation} from '../server/services/connectionChecks';
import {hostFingerprintFromPublicKey} from '../server/services/ssh/hostKey';
import {parseDataImport} from '../client/dataTransfer';

async function fixture() {
    const previous={JWT_SECRET:process.env.JWT_SECRET,FORTRESS_CREDENTIAL_KEY:process.env.FORTRESS_CREDENTIAL_KEY};
    process.env.JWT_SECRET=crypto.randomBytes(48).toString('hex');process.env.FORTRESS_CREDENTIAL_KEY=crypto.randomBytes(32).toString('hex');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fortress-interface-api-'));
    await db.initDatabase({type:'sqlite',filePath:path.join(dir,'test.db')});
    const password='Disposable-Password-123';
    const user=await db.createUser({name:'Test Admin',email:'api@example.invalid',role:'admin',auth_type:'local'},password);
    await db.saveConfig('auth_mode','local');
    const token=jwt.sign({id:user.id,role:user.role,authEpoch:0},process.env.JWT_SECRET!);
    const app=express();app.use(express.json());
    app.use('/auth',auth);app.use('/systems',systems);app.use('/locations',locations);app.use('/jobs',jobs);app.use('/keys',keys);app.use('/config',config);
    const server=app.listen(0,'127.0.0.1');const address=server.address();if(!address||typeof address==='string')throw new Error('No test port');
    const request=(route:string,method='GET',body?:unknown,bearer=token)=>fetch(`http://127.0.0.1:${address.port}${route}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${bearer}`},body:body===undefined?undefined:JSON.stringify(body)});
    return {request,password,user,token,close:async()=>{
        await new Promise<void>(resolve=>server.close(()=>resolve()));await db.closeDatabase();fs.rmSync(dir,{recursive:true,force:true});
        for(const[key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;
    }};
}

test('API accepts metadata-only system saves and round-trips exported local storage',async()=>{
    const f=await fixture();try{
        const created=await f.request('/systems','POST',{name:'Unverified source',host:'source.example.invalid',username:'backup',type:'remote',status:'offline',health:0,installedTools:[]});expect(created.status).toBe(200);const source=await created.json();expect(source.id).toBeTruthy();expect(source.hostPublicKey).toBeUndefined();
        const first=await f.request('/locations','POST',{name:'Local storage',type:'nfs',path:'/tmp/test-repo'});expect(first.status).toBe(200);
        const listing=await (await f.request('/locations')).json();expect(listing[0].host_public_key).toBeNull();
        const updated=await f.request('/locations/'+listing[0].id,'PUT',{...listing[0],name:'Imported local storage'});expect(updated.status).toBe(200);
    }finally{await f.close()}
});

test('job validation rejects missing resources and unsupported tools before saving',async()=>{
    const f=await fixture();try{
        const invalid=await f.request('/jobs','POST',{name:'Invalid job',tool:'Rclone',sourceId:'missing',destinationId:'missing',sourcePaths:['/data']});expect(invalid.status).toBe(400);expect(await db.getAllJobs()).toHaveLength(0);
        const source=await (await f.request('/systems','POST',{name:'Source',host:'source.example.invalid',type:'remote',status:'offline',health:0})).json();
        const destination=await (await f.request('/locations','POST',{name:'Storage',type:'nfs',path:'/tmp/repo'})).json();
        const created=await f.request('/jobs','POST',{name:'Job',tool:'Restic',sourceId:source.id,destinationId:destination.id,sourcePaths:['/data'],priority:'Medium',status:'Idle',schedule:'0 2 * * *'});expect(created.status).toBe(200);
        expect((await f.request('/systems/'+source.id,'DELETE')).status).toBe(409);expect((await f.request('/locations/'+destination.id,'DELETE')).status).toBe(409);
    }finally{await f.close()}
});

test('password update verifies the current password and revokes old tokens',async()=>{
    const f=await fixture();try{
        expect((await f.request('/auth/password','POST',{currentPassword:'wrong',newPassword:'Updated-Password-123'})).status).toBe(400);
        expect((await f.request('/auth/me')).status).toBe(200);
        const response=await f.request('/auth/password','POST',{currentPassword:f.password,newPassword:'Updated-Password-123'});expect(response.status).toBe(200);const result=await response.json();
        expect((await f.request('/auth/me')).status).toBe(401);expect((await f.request('/auth/me','GET',undefined,result.token)).status).toBe(200);
        expect(await db.validateUser(f.user.email,f.password)).toBeNull();expect((await db.validateUser(f.user.email,'Updated-Password-123'))?.id).toBe(f.user.id);
    }finally{await f.close()}
});

test('SSH identities validate the actual passphrase and cannot be deleted while assigned',async()=>{
    const f=await fixture();try{
        const privateKey=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs1',format:'pem',cipher:'aes-256-cbc',passphrase:'correct-identity-passphrase'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
        expect((await f.request('/keys','POST',{name:'Identity',privateKey,passphrase:'wrong'})).status).toBe(400);
        const saved=await f.request('/keys','POST',{name:'Identity',privateKey,passphrase:'correct-identity-passphrase'});expect(saved.status).toBe(200);const identity=await saved.json();
        const source=await f.request('/systems','POST',{name:'Source',host:'source.example.invalid',type:'remote',status:'offline',health:0,sshKeyId:identity.id});expect(source.status).toBe(200);
        const listing=await (await f.request('/keys')).text();expect(listing).not.toContain('PRIVATE KEY');expect(listing).not.toContain('correct-identity-passphrase');expect(listing).toContain('createdAt');
        expect((await f.request('/keys/'+identity.id,'DELETE')).status).toBe(409);
    }finally{await f.close()}
});

test('connection and database checks are real and administrative',async()=>{
    const f=await fixture();try{
        expect((await f.request('/config/database-health')).status).toBe(200);
        const local=await (await f.request('/locations','POST',{name:'Local',type:'nfs',path:'/tmp/test'})).json();
        const probe=await f.request('/locations/'+local.id+'/test','POST');expect(probe.status).toBe(501);expect((await probe.json()).error).toContain('SFTP');
        const viewer=await db.createUser({name:'Viewer',email:'viewer@example.invalid',role:'viewer',auth_type:'local'});
        const token=jwt.sign({id:viewer.id,authEpoch:0},process.env.JWT_SECRET!);
        expect((await f.request('/config/database-health','GET',undefined,token)).status).toBe(403);expect((await f.request('/locations/'+local.id+'/test','POST',undefined,token)).status).toBe(403);
    }finally{await f.close()}
});

test('SFTP verification checks the pinned host key and the actual relative directory',async()=>{
    const privateKey=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
    const parsed=sshUtils.parseKey(privateKey);if(parsed instanceof Error)throw parsed;
    const publicKey=parsed.type+' '+parsed.getPublicSSH().toString('base64');
    const seen:string[]=[];const clients=new Set<any>();
    const server=new Server({hostKeys:[privateKey]},client=>{
        clients.add(client);client.on('error',()=>{}).on('close',()=>clients.delete(client));
        client.on('authentication',context=>context.accept()).on('ready',()=>client.on('session',accept=>accept().on('sftp',accept=>{
            const sftp=accept();sftp.on('STAT',(id:number,path:Buffer)=>{seen.push(path.toString());sftp.attrs(id,{mode:0o40700,uid:1,gid:1,size:0,atime:0,mtime:0})});
        })));
    });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));const address=server.address();if(!address||typeof address==='string')throw new Error('No SFTP port');
    try{
        await checkSFTPLocation({id:'test',name:'Test',type:'sftp',path:`sftp://backup@127.0.0.1:${address.port}/backups/source`,host_public_key:publicKey,secret_key:privateKey});
        expect(seen).toEqual(['backups/source']);
        const incorrect=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;const wrong=sshUtils.parseKey(incorrect);if(wrong instanceof Error)throw wrong;
        await expect(checkSFTPLocation({id:'test',name:'Test',type:'sftp',path:`sftp://backup@127.0.0.1:${address.port}/backups/source`,host_public_key:wrong.type+' '+wrong.getPublicSSH().toString('base64'),secret_key:privateKey})).rejects.toThrow();
        expect(seen).toHaveLength(1);expect(hostFingerprintFromPublicKey(publicKey)).toStartWith('SHA256:');
    }finally{for(const client of clients)client.end();await new Promise<void>(resolve=>server.close(()=>resolve()))}
},15000);

test('malformed imports fail validation before making API writes',()=>{
    expect(()=>parseDataImport('not JSON')).toThrow('valid exported JSON');
    expect(()=>parseDataImport('{}')).toThrow('array');
    expect(()=>parseDataImport(JSON.stringify({systems:[],locations:[],jobs:[{id:'job',name:'Job',sourceId:'missing',destinationId:'missing',sourcePaths:['/data']}]}))).toThrow('reference');
});

test('automatic SSH scheduling persists opt-in and validates credentials on later edits',async()=>{
    const f=await fixture();try{
        const source=await (await f.request('/systems','POST',{name:'Scheduled source',host:'scheduled.example.invalid',type:'remote'})).json();
        const destination=await (await f.request('/locations','POST',{name:'Scheduled storage',type:'nfs',path:'/tmp/disposable-scheduled-repo'})).json();
        const payload={name:'Scheduled job',tool:'Restic',sourceId:source.id,destinationId:destination.id,sourcePaths:['/data'],repoPassword:'dummy-repository-passphrase',schedule:'0 0 1 1 *',scheduleEnabled:true};
        expect((await f.request('/jobs','POST',payload)).status).toBe(400);
        const privateKey=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
        const parsed=sshUtils.parseKey(privateKey);if(parsed instanceof Error||Array.isArray(parsed))throw new Error('Test SSH key parse failed');
        const hostPublicKey=parsed.type+' '+parsed.getPublicSSH().toString('base64');
        const identity=await (await f.request('/keys','POST',{name:'Schedule identity',privateKey})).json();
        expect((await f.request('/systems/'+source.id,'PUT',{...source,sshKeyId:identity.id,hostPublicKey})).status).toBe(200);
        const response=await f.request('/jobs','POST',payload);expect(response.status).toBe(200);const job=await response.json();expect(job.scheduleEnabled).toBe(true);expect(job.priority).toBe('Medium');expect(job.status).toBe('Idle');
        const unverified=await (await f.request('/systems','POST',{name:'Unverified replacement',host:'replacement.example.invalid',type:'remote'})).json();
        const update=await f.request('/jobs/'+job.id,'PUT',{...payload,sourceId:unverified.id,scheduleEnabled:undefined,repoPassword:undefined});expect(update.status).toBe(400);expect((await db.getJob(job.id))?.source_id).toBe(source.id);
    }finally{await f.close()}
});
