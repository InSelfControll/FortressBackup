import React from 'react';
import {afterAll,expect,test} from 'bun:test';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {renderToStaticMarkup} from 'react-dom/server';
import {AIProvider,BackupTool,JobPriority,JobStatus} from '../types.ts';

const storage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null}});
const {JobModal}=await import('../components/jobs/JobModal.tsx');
afterAll(()=>{if(storage)Object.defineProperty(globalThis,'localStorage',storage);else Reflect.deleteProperty(globalThis,'localStorage');});

test('an existing job has its saved fields and an enabled update action on the first render',()=>{
 const client=new QueryClient();
 try{
  const html=renderToStaticMarkup(React.createElement(QueryClientProvider,{client},React.createElement(JobModal,{
   isOpen:true,onClose:()=>{},aiConfig:{provider:AIProvider.NONE} as any,
   systems:[{id:'source',name:'Source',host:'source.example.invalid',type:'remote',status:'offline',health:0,installedTools:[]} as any],
   locations:[{id:'destination',name:'Storage',type:'sftp',path:'sftp:storage:repo'}],
   job:{id:'job',name:'Saved backup',tool:BackupTool.RESTIC,sourceId:'source',destinationId:'destination',sourcePaths:['/srv/files'],schedule:'0 3 * * *',priority:JobPriority.MEDIUM,status:JobStatus.IDLE,nextRun:'Pending',hasRepoPassword:true} as any,
  })));
  expect(html).toContain('value="Saved backup"');
  expect(html).toContain('value="source" selected=""');
  expect(html).toContain('value="destination" selected=""');
  expect(html).toContain('value="/srv/files"');
  const button=html.match(/<button\b[^>]*>Update Job<\/button>/)?.[0];
  expect(button).toBeDefined();
  expect(button).not.toMatch(/\sdisabled(?:=|\s|>)/);
 }finally{client.clear();}
});
