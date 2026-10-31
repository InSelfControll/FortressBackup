import {test,expect} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as db from '../server/db';
import {parseCron,cronMatches} from '../server/services/cron';
import {dispatchScheduledJobs} from '../server/routes/jobs';
import {parseBackupStats} from '../server/services/backup/stats';

test('UTC cron validates boundaries, steps, lists, and day-of-month/day-of-week semantics',()=>{
    expect(cronMatches('*/15 10 * * *',new Date('2026-10-31T10:30:00Z'))).toBe(true);
    expect(cronMatches('*/15 10 * * *',new Date('2026-10-31T10:31:00Z'))).toBe(false);
    expect(cronMatches('0 2 1 * 1',new Date('2026-11-02T02:00:00Z'))).toBe(true);
    expect(cronMatches('0 2 * * 7',new Date('2026-11-01T02:00:00Z'))).toBe(true);
    for(const cron of ['60 * * * *','0 24 * * *','* * 0 * *','*/0 * * * *','* * * *','bad cron','* * * * 8'])expect(()=>parseCron(cron)).toThrow();
});

test('SSH scheduling is opt-in, claims each minute once, and skips running jobs',async()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fortress-scheduler-'));
    await db.initDatabase({type:'sqlite',filePath:path.join(dir,'test.db')});
    try{
        for(const [id,enabled,status] of [['due',1,'Idle'],['manual',0,'Idle'],['active',1,'Running']] as const)
            await db.run('INSERT INTO jobs(id,name,tool,schedule,schedule_enabled,status) VALUES(?,?,?,?,?,?)',[id,id,'Restic','* * * * *',enabled,status]);
        const executions:string[]=[];const execute=async(id:string)=>{executions.push(id);return {status:200,body:{success:true}}};
        const date=new Date('2026-10-31T10:30:15Z');
        expect(await dispatchScheduledJobs(date,execute)).toEqual(['due']);
        expect(await dispatchScheduledJobs(date,execute)).toEqual([]);
        expect(executions).toEqual(['due']);
        expect(await dispatchScheduledJobs(new Date('2026-10-31T10:31:00Z'),execute)).toEqual(['due']);
        expect(executions).toEqual(['due','due']);
    }finally{await db.closeDatabase();fs.rmSync(dir,{recursive:true,force:true})}
});

test('legacy jobs migrate to manual-only scheduling',async()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fortress-scheduler-default-'));
    await db.initDatabase({type:'sqlite',filePath:path.join(dir,'test.db')});
    try{
        await db.run("INSERT INTO jobs(id,name,tool,status,schedule) VALUES('old','Old job','Restic','Idle','* * * * *')");
        const row=await db.getJob('old');expect(row?.schedule_enabled).toBe(0);
        expect(await dispatchScheduledJobs(new Date(),async()=>{throw new Error('Manual jobs must not run')})).toEqual([]);
    }finally{await db.closeDatabase();fs.rmSync(dir,{recursive:true,force:true})}
});

test('statistics parse Restic JSON and real Borg/Rsync output without invented values',()=>{
    expect(parseBackupStats('progress\n'+JSON.stringify({message_type:'summary',total_bytes_processed:1024,total_files_processed:12}))).toEqual({bytesProcessed:1024,filesProcessed:12});
    expect(parseBackupStats('This archive: 2.50 GB 1 GB 500 MB\nNumber of files: 123')).toEqual({bytesProcessed:2.5e9,filesProcessed:123});
    expect(parseBackupStats('Total transferred file size: 1,234,567 bytes\nNumber of regular files transferred: 7')).toEqual({bytesProcessed:1234567,filesProcessed:7});
    expect(parseBackupStats('2 MB 3 files')).toEqual({bytesProcessed:2e6,filesProcessed:3});
    expect(parseBackupStats('no statistics recorded')).toEqual({bytesProcessed:0,filesProcessed:0});
});
