import React, {useState} from 'react';
import {apiFetch} from '../client/api/client';
import {useManagedAgents} from '../client/api/queries';
import {QueryStatus} from './QueryStatus';
import type {ManagedAgent,ManagedAgentJob} from '../types';

type Enrollment={id:string;token:string;name:string};

export const managedClientStatus=(agent:ManagedAgent,now=Date.now()):string=>{
 if(agent.disabled)return 'Disabled';
 if(!agent.lastSeen)return 'Awaiting setup';
 if(agent.jobs.some(job=>job.state==='running'))return 'Job running';
 return now-Date.parse(agent.lastSeen)<=180000?'Online':'Offline';
};
export const managedJobStatus=(job:ManagedAgentJob):string=>
 job.state==='pending'?'Queued — waiting for the Windows agent':job.state==='running'?'Running on the laptop':job.state==='success'?'Completed':'Failed';

export const ManagedClientOverview:React.FC<{agents:ManagedAgent[];onOpen?:()=>void}>=({agents,onOpen})=><section className="card space-y-4" aria-label="Windows client activity">
 <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold">Windows client activity</h2><p className="text-sm text-slate-400">Recent client check-ins and operations. Updates every 10 seconds.</p></div>{onOpen&&<button onClick={onOpen} className="text-sm text-indigo-300 underline">Open Managed Clients</button>}</div>
 {agents.length===0?<p className="text-sm text-slate-400">No Windows clients enrolled.</p>:agents.slice(0,5).map(agent=><article key={agent.id} className="rounded-lg border border-slate-700 p-3 space-y-1">
  <div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium break-all">{agent.name}</h3><span className="text-sm text-slate-300">{managedClientStatus(agent)}</span></div>
  <p className="text-xs text-slate-400">Last check-in: {agent.lastSeen?new Date(agent.lastSeen).toLocaleString():'Never'}</p>
  {!agent.lastSeen&&<p className="text-sm text-amber-300">Install and configure the Windows agent to connect this laptop. Enrollment alone does not start a backup.</p>}
  {agent.jobs[0]?<p className="text-sm">{agent.jobs[0].operation}: {managedJobStatus(agent.jobs[0])}{agent.jobs[0].message&&<span className="text-slate-400"> · {agent.jobs[0].message}</span>}</p>:<p className="text-sm text-slate-400">No operations requested.</p>}
 </article>)}
</section>;

export const ManagedClients:React.FC=()=>{
 const [page,setPage]=useState(0);
 const agentsQuery=useManagedAgents(page);
 const agents=agentsQuery.data||[];
 const hasNext=agents.length===50;
 const [name,setName]=useState('');
 const [enrollment,setEnrollment]=useState<Enrollment|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const refresh=async()=>{
  const r=await agentsQuery.refetch();
  if(r.error)setError(r.error.message);
 };
 const enroll=async()=>{
  if(busy||!name.trim())return;
  setBusy(true);setError('');
  const r=await apiFetch<Enrollment>('/managed-agents/admin/enroll',{method:'POST',body:JSON.stringify({name:name.trim()})});
  if(r.data){setEnrollment(r.data);setName('');await refresh()}else setError(r.error||'Enrollment failed');
  setBusy(false);
 };
 const job=async(id:string,operation:string)=>{
  if(busy)return;
  setBusy(true);setError('');
  const r=await apiFetch('/managed-agents/admin/'+encodeURIComponent(id)+'/jobs',{method:'POST',body:JSON.stringify({operation})});
  if(r.error)setError(r.error);await refresh();setBusy(false);
 };
 const schedule=async(id:string,minutes:number)=>{
  if(busy)return;
  setBusy(true);setError('');
  const r=await apiFetch('/managed-agents/admin/'+encodeURIComponent(id)+'/schedule',{method:'PUT',body:JSON.stringify({minutes})});
  if(r.error)setError(r.error);await refresh();setBusy(false);
 };
 const disable=async(id:string)=>{
  if(busy)return;
  if(!window.confirm('Disable this agent and revoke access?'))return;
  setBusy(true);setError('');const r=await apiFetch('/managed-agents/admin/'+encodeURIComponent(id)+'/disable',{method:'POST',body:'{}'});
  if(r.error)setError(r.error);await refresh();setBusy(false);
 };
 return <section className="space-y-6 text-slate-100">
  <header><h1 className="text-2xl font-semibold">Managed Windows Clients</h1><p className="text-slate-400 text-sm">Install the Windows agent once on each laptop. It connects outbound over HTTPS; no inbound Windows ports are needed.</p></header>
  <QueryStatus pending={agentsQuery.isPending} error={agentsQuery.error} retry={()=>void refresh()}/>
  <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
   <h2 className="font-semibold">Enroll a client</h2>
   <p className="text-sm text-slate-400">Enrollment creates an ID and token. It does not install software, select folders, or start a backup.</p>
   <div className="flex flex-col sm:flex-row gap-3"><input aria-label="Client name" maxLength={100} value={name} onChange={e=>setName(e.target.value)} className="px-3 py-2 bg-slate-800 border border-slate-600 rounded min-w-0 flex-1" placeholder="Windows laptop"/><button disabled={busy||!name.trim()} onClick={enroll} className="bg-indigo-600 disabled:opacity-50 px-4 py-2 rounded">Enroll</button></div>
   {enrollment&&<div className="border border-amber-500 rounded p-3 space-y-2"><strong className="text-amber-300">Save credentials now. Token displayed only once.</strong><p>Client ID: <code className="break-all">{enrollment.id}</code></p><p>Token: <code className="break-all select-all">{enrollment.token}</code></p><button className="underline" onClick={()=>setEnrollment(null)}>I've saved these credentials</button></div>}
  </div>
  <details className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3" open={agents.some(agent=>!agent.lastSeen&&!agent.disabled)}>
   <summary className="cursor-pointer font-semibold">Set up the Windows laptop and choose folders</summary>
   <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-300">
    <li>Install the Fortress Windows agent and Restic on the laptop using the Windows setup guide.</li>
    <li>In the laptop's <code>agent.json</code>, set <code>sources</code> to the folders you want backed up, such as Documents or Pictures. Configure the repository and password file locally. Folder selection is not available in this web interface.</li>
    <li>Set a trusted HTTPS controller address and the enrollment ID and token file, then install the managed scheduled task. The agent cannot connect to an HTTP controller address.</li>
    <li>The task checks in every minute. After the first check-in, queued operations can start and their status appears here and on the dashboard.</li>
   </ol>
   <div className="flex flex-wrap gap-4 text-sm"><a className="text-indigo-300 underline" href="https://github.com/InSelfControll/FortressBackup/releases" target="_blank" rel="noreferrer">Download Windows agent and installer</a><a className="text-indigo-300 underline" href="https://github.com/InSelfControll/FortressBackup/blob/main/agent/windows/INSTALL.md" target="_blank" rel="noreferrer">Windows agent setup guide</a></div>
  </details>
  {error&&<p role="alert" className="text-red-400">{error}</p>}
  <div className="space-y-3">{agents.map(agent=><article key={agent.id} className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
   <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold break-words">{agent.name}</h2><p className="text-xs text-slate-400 break-all">{agent.id}</p><p className="text-sm text-slate-300">{managedClientStatus(agent)}</p><p className="text-xs text-slate-400">Last check-in: {agent.lastSeen?new Date(agent.lastSeen).toLocaleString():'Never'}</p></div>
   <div className="flex flex-wrap gap-2">{(['backup','check','snapshots'] as const).map(op=><button key={op} disabled={busy||agent.disabled||agent.jobs.some(j=>j.state==='pending'||j.state==='running')} onClick={()=>job(agent.id,op)} className="px-3 py-2 rounded bg-slate-700 disabled:opacity-50">{op}</button>)}<button disabled={busy||agent.disabled} onClick={()=>disable(agent.id)} className="px-3 py-2 rounded bg-red-900 disabled:opacity-50">Disable</button></div></div>
   {!agent.lastSeen&&<p className="text-sm text-amber-300">No backup has started. Waiting for the Windows agent to be installed, configured, and connected.</p>}
   <div className="flex flex-wrap gap-3 items-center text-sm"><label htmlFor={'schedule-'+agent.id}>Backup schedule</label><select id={'schedule-'+agent.id} disabled={busy||agent.disabled} value={agent.scheduleMinutes||0} onChange={e=>void schedule(agent.id,Number(e.target.value))} className="bg-slate-800 p-2 rounded"><option value={0}>Manual</option><option value={60}>Hourly</option><option value={360}>Every 6 hours</option><option value={1440}>Daily</option><option value={10080}>Weekly</option></select><span className="text-slate-400">Next: {agent.nextRunAt||'Not scheduled'}</span></div>
   <div className="text-sm break-words space-y-1">{agent.jobs.map(j=><p key={j.id}><span className="font-medium">{j.operation}</span> · {managedJobStatus(j)} · {new Date(j.createdAt).toLocaleString()} {j.message&&<span className="text-slate-400">{j.message}</span>}</p>)}</div>
  </article>)}</div>
  <div className="flex items-center gap-4 text-sm">
   <button disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))} className="underline disabled:opacity-40">Previous</button>
   <span>Page {page+1}</span>
   <button disabled={!hasNext} onClick={()=>setPage(p=>p+1)} className="underline disabled:opacity-40">Next</button>
   <button onClick={()=>void refresh()} className="underline">Refresh</button>
  </div>
 </section>;
};
