import React from 'react';
import {afterAll,expect,test} from 'bun:test';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {renderToStaticMarkup} from 'react-dom/server';
import type {ManagedAgent} from '../types.ts';

const storage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null}});
const {ManagedClients,ManagedClientOverview,managedClientStatus}=await import('../components/ManagedClients.tsx');
const {queryKeys}=await import('../client/api/queries.ts');
afterAll(()=>{if(storage)Object.defineProperty(globalThis,'localStorage',storage);else Reflect.deleteProperty(globalThis,'localStorage');});

const agent:ManagedAgent={id:'laptop-id',name:'Windows laptop',createdAt:'2026-10-31T10:00:00Z',lastSeen:null,disabled:false,
 jobs:[{id:'queued-job',operation:'backup',state:'pending',createdAt:'2026-10-31T10:01:00Z'}]};

test('client status distinguishes enrollment, check-in, long-running jobs, and revocation',()=>{
 const now=Date.parse('2026-10-31T11:00:00Z');
 expect(managedClientStatus(agent,now)).toBe('Awaiting setup');
 expect(managedClientStatus({...agent,lastSeen:new Date(now-60000).toISOString()},now)).toBe('Online');
 expect(managedClientStatus({...agent,lastSeen:new Date(now-240000).toISOString()},now)).toBe('Offline');
 expect(managedClientStatus({...agent,lastSeen:'2026-10-31T10:00:00Z',jobs:[{...agent.jobs[0],state:'running'}]},now)).toBe('Job running');
 expect(managedClientStatus({...agent,disabled:true},now)).toBe('Disabled');
});

test('dashboard visibility never describes an unclaimed Windows backup as running',()=>{
 const html=renderToStaticMarkup(React.createElement(ManagedClientOverview,{agents:[agent],onOpen:()=>{}}));
 expect(html).toContain('Windows client activity');
 expect(html).toContain('Windows laptop');
 expect(html).toContain('Awaiting setup');
 expect(html).toContain('Queued — waiting for the Windows agent');
 expect(html).toContain('Last check-in: Never');
 expect(html).toContain('Open Managed Clients');
 expect(html).not.toContain('Running on the laptop');
});

test('enrolled clients receive installation and local folder-selection instructions',()=>{
 const client=new QueryClient();
 client.setQueryData([...queryKeys.managedAgents,0],[agent]);
 try{
  const html=renderToStaticMarkup(React.createElement(QueryClientProvider,{client},React.createElement(ManagedClients)));
  expect(html).toContain('Enrollment creates an ID and token. It does not install software');
  expect(html).toContain('Set up the Windows laptop and choose folders');
  expect(html).toContain('agent.json');
  expect(html).toContain('sources');
  expect(html).toContain('trusted HTTPS controller address');
  expect(html).toContain('No backup has started.');
  expect(html).toContain('Queued — waiting for the Windows agent');
 }finally{client.clear();}
});

test('a single configured repository is selected automatically without exposing credentials',()=>{
 const client=new QueryClient();
 client.setQueryData([...queryKeys.managedAgents,0],[agent]);
 client.setQueryData(queryKeys.jobs,[{id:'saved-repository',name:'Saved Restic job',tool:'Restic',hasRepoPassword:true,destinationId:'storage'}]);
 client.setQueryData(queryKeys.locations,[{id:'storage',name:'Existing storage',type:'sftp',hasSecretKey:true}]);
 try{
  const html=renderToStaticMarkup(React.createElement(QueryClientProvider,{client},React.createElement(ManagedClients)));
  expect(html).toContain('value="saved-repository" selected=""');
  expect(html).toContain('Saved Restic job — Existing storage');
  expect(html).toContain('retrieves this repository&#x27;s saved encryption password');
  expect(html).toContain('Assign a repository before running Windows setup.');
 }finally{client.clear()}
});
