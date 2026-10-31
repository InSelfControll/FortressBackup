import React, {useEffect,useState} from 'react';
import {apiFetch} from '../client/api/client';

type AgentJob={id:string;operation:string;state:string;createdAt:string;finishedAt?:string;message?:string};
type Agent={id:string;name:string;createdAt:string;lastSeen?:string;disabled:boolean;scheduleMinutes?:number;nextRunAt?:string;jobs:AgentJob[]};
type Enrollment={id:string;token:string;name:string};

export const ManagedClients:React.FC=()=>{
 const [agents,setAgents]=useState<Agent[]>([]);
 const [page,setPage]=useState(0);
 const [hasNext,setHasNext]=useState(false);
 const [name,setName]=useState('');
 const [enrollment,setEnrollment]=useState<Enrollment|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const refresh=async()=>{
  const r=await apiFetch<Agent[]>('/managed-agents/admin?limit=50&offset='+page*50);
  if(r.error)setError(r.error); else {setAgents(r.data||[]);setHasNext((r.data||[]).length===50)}
 };
 useEffect(()=>{void refresh();const timer=setInterval(()=>{void refresh()},30000);return ()=>clearInterval(timer)},[page]);
 const enroll=async()=>{
  if(!name.trim())return;
  setBusy(true);setError('');
  const r=await apiFetch<Enrollment>('/managed-agents/admin/enroll',{method:'POST',body:JSON.stringify({name:name.trim()})});
  if(r.data){setEnrollment(r.data);setName('');await refresh()}else setError(r.error||'Enrollment failed');
  setBusy(false);
 };
 const job=async(id:string,operation:string)=>{
  setBusy(true);setError('');
  const r=await apiFetch('/managed-agents/admin/'+encodeURIComponent(id)+'/jobs',{method:'POST',body:JSON.stringify({operation})});
  if(r.error)setError(r.error);await refresh();setBusy(false);
 };
 const schedule=async(id:string,minutes:number)=>{
  setBusy(true);setError('');
  const r=await apiFetch('/managed-agents/admin/'+encodeURIComponent(id)+'/schedule',{method:'PUT',body:JSON.stringify({minutes})});
  if(r.error)setError(r.error);await refresh();setBusy(false);
 };
 const disable=async(id:string)=>{
  if(!window.confirm('Disable this agent and revoke access?'))return;
  setBusy(true);const r=await apiFetch('/managed-agents/admin/'+encodeURIComponent(id)+'/disable',{method:'POST',body:'{}'});
  if(r.error)setError(r.error);await refresh();setBusy(false);
 };
 return <section className="space-y-6 text-slate-100">
  <header><h1 className="text-2xl font-semibold">Managed Windows Clients</h1><p className="text-slate-400 text-sm">Encrypted Restic backup agents connect outbound over HTTPS. No inbound Windows ports.</p></header>
  <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
   <h2 className="font-semibold">Enroll a client</h2>
   <div className="flex flex-col sm:flex-row gap-3"><input aria-label="Client name" maxLength={100} value={name} onChange={e=>setName(e.target.value)} className="px-3 py-2 bg-slate-800 border border-slate-600 rounded min-w-0 flex-1" placeholder="Windows laptop"/><button disabled={busy||!name.trim()} onClick={enroll} className="bg-indigo-600 disabled:opacity-50 px-4 py-2 rounded">Enroll</button></div>
   {enrollment&&<div className="border border-amber-500 rounded p-3 space-y-2"><strong className="text-amber-300">Save credentials now. Token displayed only once.</strong><p>Client ID: <code className="break-all">{enrollment.id}</code></p><p>Token: <code className="break-all select-all">{enrollment.token}</code></p><button className="underline" onClick={()=>setEnrollment(null)}>I've saved these credentials</button></div>}
  </div>
  {error&&<p role="alert" className="text-red-400">{error}</p>}
  <div className="space-y-3">{agents.map(agent=><article key={agent.id} className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
   <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold break-words">{agent.name}</h2><p className="text-xs text-slate-400 break-all">{agent.id}</p><p className="text-xs text-slate-400">Last seen: {agent.lastSeen||'Never'} · {agent.disabled?'Disabled':'Enabled'}</p></div>
   <div className="flex flex-wrap gap-2">{(['backup','check','snapshots'] as const).map(op=><button key={op} disabled={busy||agent.disabled} onClick={()=>job(agent.id,op)} className="px-3 py-2 rounded bg-slate-700 disabled:opacity-50">{op}</button>)}<button disabled={busy||agent.disabled} onClick={()=>disable(agent.id)} className="px-3 py-2 rounded bg-red-900 disabled:opacity-50">Disable</button></div></div>
   <div className="flex flex-wrap gap-3 items-center text-sm"><label htmlFor={'schedule-'+agent.id}>Backup schedule</label><select id={'schedule-'+agent.id} disabled={busy||agent.disabled} value={agent.scheduleMinutes||0} onChange={e=>void schedule(agent.id,Number(e.target.value))} className="bg-slate-800 p-2 rounded"><option value={0}>Manual</option><option value={60}>Hourly</option><option value={360}>Every 6 hours</option><option value={1440}>Daily</option><option value={10080}>Weekly</option></select><span className="text-slate-400">Next: {agent.nextRunAt||'Not scheduled'}</span></div>
   <div className="text-sm break-words space-y-1">{agent.jobs.slice(-8).reverse().map(j=><p key={j.id}><span className="font-medium">{j.operation}</span> · {j.state} · {j.createdAt} {j.message&&<span className="text-slate-400">{j.message}</span>}</p>)}</div>
  </article>)}</div>
  <div className="flex items-center gap-4 text-sm">
   <button disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))} className="underline disabled:opacity-40">Previous</button>
   <span>Page {page+1}</span>
   <button disabled={!hasNext} onClick={()=>setPage(p=>p+1)} className="underline disabled:opacity-40">Next</button>
   <button onClick={()=>void refresh()} className="underline">Refresh</button>
  </div>
 </section>;
};
