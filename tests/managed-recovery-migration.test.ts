import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {initDatabase,closeDatabase} from '../server/db/connection';
import {query,run} from '../server/db/helpers';

test('legacy managed jobs migrate without losing a running operation or schedule uniqueness',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fortress-migration-')),file=path.join(dir,'db');
 const db=new Database(file);
 db.exec(`CREATE TABLE managed_clients(id TEXT PRIMARY KEY,name TEXT NOT NULL,token_hash TEXT NOT NULL,created_at TEXT NOT NULL,last_seen TEXT,disabled INTEGER DEFAULT 0,schedule_minutes INTEGER DEFAULT 0,next_run_at TEXT);
 CREATE TABLE managed_jobs(id TEXT PRIMARY KEY,client_id TEXT NOT NULL REFERENCES managed_clients(id),operation TEXT NOT NULL CHECK(operation IN ('backup','check','snapshots')),state TEXT NOT NULL,created_at TEXT NOT NULL,started_at TEXT,finished_at TEXT,lease_until TEXT,schedule_slot TEXT,message TEXT);
 CREATE UNIQUE INDEX idx_managed_active ON managed_jobs(client_id) WHERE state IN ('pending','running');
 INSERT INTO managed_clients(id,name,token_hash,created_at) VALUES('client','Laptop','unchanged-token-hash','2026-11-01');
 INSERT INTO managed_jobs(id,client_id,operation,state,created_at,schedule_slot,message) VALUES('running','client','backup','running','2026-11-01','unique-slot','keep message');`);
 db.close();
 try{
  await initDatabase({type:'sqlite',filePath:file});
  expect((await query<any>('SELECT * FROM managed_jobs'))[0]).toMatchObject({id:'running',state:'running',operation:'backup',schedule_slot:'unique-slot',message:'keep message'});
  expect((await query<any>('SELECT token_hash,capabilities FROM managed_clients'))[0]).toEqual({token_hash:'unchanged-token-hash',capabilities:'[]'});
  await expect(run("INSERT INTO managed_jobs(id,client_id,operation,state,created_at) VALUES('conflict','client','restore','pending','today')")).rejects.toThrow();
  await run("UPDATE managed_jobs SET state='success' WHERE id='running'");
  await run("INSERT INTO managed_jobs(id,client_id,operation,state,created_at,request_json) VALUES('restore','client','restore','pending','today','{}')");
  await expect(run("INSERT INTO managed_jobs(id,client_id,operation,state,created_at,schedule_slot) VALUES('slot-conflict','client','backup','success','today','unique-slot')")).rejects.toThrow();
  await closeDatabase();await initDatabase({type:'sqlite',filePath:file});
  expect(await query('SELECT id FROM managed_jobs')).toHaveLength(2);
 }finally{await closeDatabase();fs.rmSync(dir,{recursive:true,force:true})}
});
