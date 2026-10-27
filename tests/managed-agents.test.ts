import { test, expect } from 'bun:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import managedAgentsRouter, { dispatchScheduledManagedJobs } from '../server/routes/managedAgents.js';
import { query, run } from '../server/db/helpers.js';
import { initDatabase, closeDatabase } from '../server/db/connection.js';

test('managed agent enrollment, atomic dispatch, report and revocation', async () => {
  process.env.JWT_SECRET = 'fortress-integration-test-only-not-for-production-12345';
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fortress-test-'));
  const app=express();
  app.use(express.json());
  app.use('/api/managed-agents',managedAgentsRouter);
  await initDatabase({type:'sqlite',filePath:path.join(dir,'data.db')});
  const server=app.listen(0,'127.0.0.1');
  try {
    const address=server.address();
    if (!address || typeof address==='string') throw new Error('Unable to bind test server');
    const base='http://127.0.0.1:'+address.port+'/api/managed-agents';
    const adminToken=jwt.sign({id:'admin',role:'admin'},process.env.JWT_SECRET);
    const adminHeaders={Authorization:'Bearer '+adminToken,'Content-Type':'application/json'};
    const api=async(path:string,body:any,headers:Record<string,string>=adminHeaders,method='POST')=>{
      const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
      let data:any;try{data=await response.json()}catch{data={}};
      return {status:response.status,data};
    };
    const denied=await api('/admin/enroll',{name:'fail'}, {'Content-Type':'application/json'});
    expect(denied.status).toBe(401);
    const enrollment=await api('/admin/enroll',{name:'Laptop One'});
    expect(enrollment.status).toBe(201);
    expect(enrollment.data.token.length).toBeGreaterThan(40);
    const id=enrollment.data.id;
    const auth={'Content-Type':'application/json','Authorization':'Bearer '+enrollment.data.token,'X-Fortress-Agent-Id':id};
    const queue=await api('/admin/'+id+'/jobs',{operation:'backup'});
    expect(queue.status).toBe(201);
    const overlapping=await api('/admin/'+id+'/jobs',{operation:'check'});
    expect(overlapping.status).toBe(409);
    const poll=await api('/poll',{},auth);
    expect(poll.status).toBe(200);
    expect(poll.data.job.id).toBe(queue.data.id);
    const idlePoll=await api('/poll',{},auth);
    expect(idlePoll.data.job.id).toBe(queue.data.id);
    expect(idlePoll.data.resumed).toBe(true);
    const report=await api('/report',{id:queue.data.id,success:true,message:'ok'},auth);
    expect(report.status).toBe(200);
    const repeated=await api('/report',{id:queue.data.id,success:true,message:'ok'},auth);
    expect(repeated.status).toBe(200);
    expect(repeated.data.duplicate).toBe(true);
    const listing=await api('/admin',undefined,adminHeaders,'GET');
    expect(listing.status).toBe(200);
    expect(listing.data[0].jobs[0].state).toBe('success');
    expect(JSON.stringify(listing.data)).not.toContain(enrollment.data.token);
    expect(JSON.stringify(listing.data)).not.toContain('token_hash');
    // Two simultaneous scheduler replicas must not create two jobs in one slot.
    const slot=new Date(Date.now()-60000).toISOString();
    const schedule=await api('/admin/'+id+'/schedule',{minutes:15},adminHeaders,'PUT');
    expect(schedule.status).toBe(200);
    await run('UPDATE managed_clients SET next_run_at=? WHERE id=?',[slot,id]);
    await Promise.all([dispatchScheduledManagedJobs(),dispatchScheduledManagedJobs()]);
    const first=await query<{id:string}>('SELECT id FROM managed_jobs WHERE client_id=? AND schedule_slot=?',[id,slot]);
    expect(first).toHaveLength(1);
    await run("UPDATE managed_jobs SET state='success' WHERE id=?",[first[0].id]);
    // A stale due timestamp must not create another finished backup.
    await run('UPDATE managed_clients SET next_run_at=? WHERE id=?',[slot,id]);
    await dispatchScheduledManagedJobs();
    const again=await query<{id:string}>('SELECT id FROM managed_jobs WHERE client_id=? AND schedule_slot=?',[id,slot]);
    expect(again).toHaveLength(1);
    const disabled=await api('/admin/'+id+'/disable',{});
    expect(disabled.status).toBe(200);
    const deniedAfterDisable=await api('/poll',{},auth);
    expect(deniedAfterDisable.status).toBe(401);
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await closeDatabase();
    fs.rmSync(dir,{recursive:true,force:true});
  }
},30000);
