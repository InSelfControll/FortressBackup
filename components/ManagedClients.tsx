import React, {useState} from 'react';
import {apiFetch} from '../client/api/client';
import {useManagedAgents,useJobs,useLocations} from '../client/api/queries';
import {QueryStatus} from './QueryStatus';
import type {ManagedAgent,ManagedAgentJob} from '../types';
import {ManagedRestore,operationLabel,currentManagedJob} from './ManagedRestore';

type Enrollment={id:string;token:string;name:string};

export const managedClientStatus=(agent:ManagedAgent,now=Date.now()):string=>{
 if(agent.disabled)return 'Disabled';
 const active=agent.jobs.find(job=>job.state==='running');
 if(active)return operationLabel(active.operation)+' running';
 if(!agent.lastSeen)return 'Awaiting setup';
 return now-Date.parse(agent.lastSeen)<=180000?'Online':'Offline';
};
export const managedJobStatus=(job:ManagedAgentJob):string=>
 job.state==='canceled'?'Canceled':job.cancelRequested?'Cancellation requested — waiting for the agent to stop':job.state==='pending'?'Queued — waiting for the Windows agent':job.state==='running'?'Running on the laptop':job.state==='success'?'Completed':'Failed';

export const ManagedClientOverview:React.FC<{agents:ManagedAgent[];onOpen?:()=>void}>=({agents,onOpen})=><section className="card space-y-4" aria-label="Windows client activity">
 <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold">Windows client activity</h2><p className="text-sm text-slate-400">Recent client check-ins and operations. Updates every 2 seconds.</p></div>{onOpen&&<button onClick={onOpen} className="text-sm text-indigo-300 underline">Open Managed Clients</button>}</div>
 {agents.length===0?<p className="text-sm text-slate-400">No Windows clients enrolled.</p>:agents.slice(0,5).map(agent=><article key={agent.id} className="rounded-lg border border-slate-700 p-3 space-y-1">
  <div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium break-all">{agent.name}</h3><span className="text-sm text-slate-300">{managedClientStatus(agent)}</span></div>
  <p className="text-xs text-slate-400">Last check-in: {agent.lastSeen?new Date(agent.lastSeen).toLocaleString():'Never'}</p>
  {!agent.lastSeen&&<p className="text-sm text-amber-300">Install and configure the Windows agent to connect this laptop. Enrollment alone does not start a backup.</p>}
  {currentManagedJob(agent.jobs)?<p className="text-sm">Restic · {operationLabel(currentManagedJob(agent.jobs)!.operation)}: {managedJobStatus(currentManagedJob(agent.jobs)!)}{currentManagedJob(agent.jobs)!.message&&<span className="text-slate-400"> · {currentManagedJob(agent.jobs)!.message}</span>}</p>:<p className="text-sm text-slate-400">No operations requested.</p>}
 </article>)}
</section>;

export const ManagedClients:React.FC=()=>{
 const [page,setPage]=useState(0);
 const agentsQuery=useManagedAgents(page);
 const agents=agentsQuery.data||[];
 const jobsQuery=useJobs();
 const locationsQuery=useLocations();
 const repositories=(jobsQuery.data||[]).filter(job=>job.tool==='Restic'&&job.hasRepoPassword&&
  (locationsQuery.data||[]).some(location=>location.id===job.destinationId&&location.type==='sftp'&&location.hasSecretKey));
 const repositoryLabel=(id:string)=>{
  const job=repositories.find(item=>item.id===id);
  return job?job.name+' — '+(locationsQuery.data||[]).find(location=>location.id===job.destinationId)?.name:'Choose a saved repository';
 };
 const [repositoryJobId,setRepositoryJobId]=useState('');
 const selectedRepository=repositories.some(repository=>repository.id===repositoryJobId)?repositoryJobId:(repositories.length===1?repositories[0].id:'');
 const repositoriesLoading=jobsQuery.isFetching||locationsQuery.isFetching;
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
  if(busy||!name.trim()||repositoriesLoading||jobsQuery.isError||locationsQuery.isError||(repositories.length>0&&!selectedRepository))return;
  setBusy(true);setError('');
  const r=await apiFetch<Enrollment>('/managed-agents/admin/enroll',{method:'POST',body:JSON.stringify({name:name.trim(),...(selectedRepository?{repositoryJobId:selectedRepository}:{})})});
  if(r.data){setEnrollment(r.data);setName('');await refresh()}else setError(r.error||'Enrollment failed');
  setBusy(false);
 };
 const assignRepository=async(id:string,repositoryJobId:string)=>{
  if(busy||!repositoryJobId)return;
  setBusy(true);setError('');
  const r=await apiFetch('/managed-agents/admin/'+encodeURIComponent(id)+'/repository',{method:'PUT',body:JSON.stringify({repositoryJobId})});
  if(r.error)setError(r.error);await refresh();setBusy(false);
 };
 const job=async(id:string,operation:string)=>{
  if(busy)return;
  setBusy(true);setError('');
  const r=await apiFetch('/managed-agents/admin/'+encodeURIComponent(id)+'/jobs',{method:'POST',body:JSON.stringify({operation})});
  if(r.error)setError(r.error);await refresh();setBusy(false);
 };
 const lifecycle=async(agent:ManagedAgent,action:'enable'|'remove')=>{
  if(action==='remove'&&!window.confirm('Permanently remove this enrollment, revoke its credentials, and remove controller job history? Repository backups will be preserved.'))return;
  setBusy(true);setError('');const r=await apiFetch('/managed-agents/admin/'+encodeURIComponent(agent.id)+(action==='enable'?'/enable':''),{method:action==='enable'?'POST':'DELETE',...(action==='enable'?{body:'{}'}:{})});
  if(r.error)setError(r.error);await refresh();setBusy(false);
 };
 const cancel=async(agent:ManagedAgent,job:ManagedAgentJob)=>{
  setError('');const r=await apiFetch('/managed-agents/admin/'+agent.id+'/jobs/'+job.id+'/cancel',{method:'POST',body:'{}'});if(r.error)setError(r.error);await refresh();
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
  <QueryStatus pending={jobsQuery.isPending} error={jobsQuery.error} retry={()=>void jobsQuery.refetch()}/>
  <QueryStatus pending={locationsQuery.isPending} error={locationsQuery.error} retry={()=>void locationsQuery.refetch()}/>
  <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
   <h2 className="font-semibold">Enroll a client</h2>
   <p className="text-sm text-slate-400">Enrollment creates an ID and token. It does not install software, select folders, or start a backup.</p>
   <label className="block text-sm" htmlFor="enrollment-repository">Saved backup repository</label>
   <select id="enrollment-repository" value={selectedRepository} disabled={busy} onChange={event=>setRepositoryJobId(event.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2"><option value="">Choose a saved repository</option>{repositories.map(repository=><option key={repository.id} value={repository.id}>{repositoryLabel(repository.id)}</option>)}</select>
   <p className="text-sm text-slate-400">Windows setup retrieves this repository's saved encryption password, SSH identity, and host verification securely. You only choose the laptop's folders. Automatic setup supports configured Restic SFTP repositories.</p>
   <div className="flex flex-col sm:flex-row gap-3"><input aria-label="Client name" maxLength={100} value={name} onChange={e=>setName(e.target.value)} className="px-3 py-2 bg-slate-800 border border-slate-600 rounded min-w-0 flex-1" placeholder="Windows laptop"/><button disabled={busy||!name.trim()||repositoriesLoading||jobsQuery.isError||locationsQuery.isError||(repositories.length>0&&!selectedRepository)} onClick={enroll} className="bg-indigo-600 disabled:opacity-50 px-4 py-2 rounded">Enroll</button></div>
   {enrollment&&<div className="border border-amber-500 rounded p-3 space-y-2"><strong className="text-amber-300">Save credentials now. Token displayed only once.</strong><p>Client ID: <code className="break-all">{enrollment.id}</code></p><p>Token: <code className="break-all select-all">{enrollment.token}</code></p><button className="underline" onClick={()=>setEnrollment(null)}>I've saved these credentials</button></div>}
  </div>
  <details className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3" open={agents.some(agent=>!agent.lastSeen&&!agent.disabled)}>
   <summary className="cursor-pointer font-semibold">Set up the Windows laptop and choose folders</summary>
   <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-300">
    <li>Download the Windows installer from Releases and run it. It installs Fortress Backup and adds a Start menu shortcut. Open the app after installation or configure it later.</li>
    <li>Choose a saved repository here. In the installed Fortress Backup app, enter the trusted HTTPS controller address and enrollment credentials, then click Connect. The app retrieves the saved repository and credentials automatically.</li>
    <li>Use Add folder and Remove to choose folders, then Save and connect to verify access and start the agent. Reopen the app from the Start menu to edit saved folders later.</li>
    <li>Setup verifies storage and controller access as SYSTEM before starting the task. The task checks in every minute. Check-ins and queued, running, completed, or failed operations appear here and on the dashboard. Setup errors stay visible; local diagnostics are in <code>C:\ProgramData\FortressBackup</code>.</li>
   </ol>
   <div className="flex flex-wrap gap-4 text-sm"><a className="text-indigo-300 underline" href="https://github.com/InSelfControll/FortressBackup/releases" target="_blank" rel="noreferrer">Download Windows agent and installer</a><a className="text-indigo-300 underline" href="https://github.com/InSelfControll/FortressBackup/blob/main/agent/windows/INSTALL.md" target="_blank" rel="noreferrer">Windows agent setup guide</a></div>
  </details>
  {error&&<p role="alert" className="text-red-400">{error}</p>}
  <div className="space-y-3">{agents.map(agent=><article key={agent.id} className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
   <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold break-words">{agent.name}</h2><p className="text-xs text-slate-400 break-all">{agent.id}</p><p className="text-sm text-slate-300">{managedClientStatus(agent)}</p><p className="text-xs text-slate-400">Last check-in: {agent.lastSeen?new Date(agent.lastSeen).toLocaleString():'Never'}</p></div>
   <div className="flex flex-wrap gap-2">{(['backup','check'] as const).map(op=><button key={op} disabled={busy||agent.disabled||agent.jobs.some(j=>j.state==='pending'||j.state==='running')} onClick={()=>job(agent.id,op)} className="px-3 py-2 rounded bg-slate-700 disabled:opacity-50">{op==='backup'?'Back up now':'Verify repository'}</button>)}{agent.disabled&&<><button disabled={busy} onClick={()=>void lifecycle(agent,'enable')} className="px-3 py-2 rounded bg-indigo-600">Enable</button><button disabled={busy||agent.jobs.some(j=>j.state==='running')} onClick={()=>void lifecycle(agent,'remove')} className="px-3 py-2 rounded bg-red-900">Remove enrollment</button></>}<button disabled={busy||agent.disabled} onClick={()=>disable(agent.id)} className="px-3 py-2 rounded bg-red-900 disabled:opacity-50">Disable</button></div></div>
   {!agent.lastSeen&&<p className="text-sm text-amber-300">No backup has started. Waiting for the Windows agent to be installed, configured, and connected.</p>}
   <div className="flex flex-wrap gap-3 items-center text-sm"><label htmlFor={'repository-'+agent.id}>Backup repository</label><select id={'repository-'+agent.id} value={agent.repositoryJobId||''} disabled={busy||agent.disabled} onChange={event=>void assignRepository(agent.id,event.target.value)} className="max-w-full bg-slate-800 p-2 rounded"><option value="">Choose a saved repository</option>{repositories.map(repository=><option key={repository.id} value={repository.id}>{repositoryLabel(repository.id)}</option>)}</select>{agent.repositoryJobId?<span className="text-slate-400">Setup uses saved credentials. Rerun setup to apply repository changes.</span>:<span className="text-amber-300">Assign a repository before running Windows setup.</span>}</div>
   <div className="flex flex-wrap gap-3 items-center text-sm"><label htmlFor={'schedule-'+agent.id}>Backup schedule</label><select id={'schedule-'+agent.id} disabled={busy||agent.disabled} value={agent.scheduleMinutes||0} onChange={e=>void schedule(agent.id,Number(e.target.value))} className="bg-slate-800 p-2 rounded"><option value={0}>Manual</option><option value={60}>Hourly</option><option value={360}>Every 6 hours</option><option value={1440}>Daily</option><option value={10080}>Weekly</option></select><span className="text-slate-400">Next: {agent.nextRunAt||'Not scheduled'}</span></div>
   <ManagedRestore agent={agent}/><div className="text-sm break-words space-y-1">{agent.jobs.map(j=><p key={j.id}><span className="font-medium">Restic · {operationLabel(j.operation)}</span> · {managedJobStatus(j)} · {new Date(j.createdAt).toLocaleString()} {j.message&&<span className="text-slate-400">{j.message}</span>}{['pending','running'].includes(j.state)&&<button disabled={!!j.cancelRequested} className="ml-3 underline text-amber-300 disabled:opacity-50" onClick={()=>void cancel(agent,j)}>{j.cancelRequested?'Cancel requested':'Cancel job'}</button>}</p>)}</div>
  </article>)}</div>
  <div className="flex items-center gap-4 text-sm">
   <button disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))} className="underline disabled:opacity-40">Previous</button>
   <span>Page {page+1}</span>
   <button disabled={!hasNext} onClick={()=>setPage(p=>p+1)} className="underline disabled:opacity-40">Next</button>
   <button onClick={()=>void refresh()} className="underline">Refresh</button>
  </div>
 </section>;
};
