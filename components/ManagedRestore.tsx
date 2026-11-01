import React,{useEffect,useState} from 'react';
import {apiFetch,requireData} from '../client/api/client';
import {useQueryClient} from '@tanstack/react-query';
import {queryKeys} from '../client/api/queries';
import type {ManagedAgent,ManagedAgentJob,ManagedOperation,ManagedRequest,ManagedResult,Snapshot,ManagedFile} from '../types';

export const operationLabel=(operation:ManagedOperation)=>({backup:'Backup',check:'Repository check',snapshots:'List saved backups',files:'Browse backup files',restore:'Restore'}[operation]);
export const currentManagedJob=(jobs:ManagedAgentJob[])=>jobs.find(j=>j.state==='running')||jobs.find(j=>j.state==='pending')||jobs[0];

export function ManagedRestore({agent}:{agent:ManagedAgent}){
 const client=useQueryClient();
 const [job,setJob]=useState<ManagedAgentJob|null>(null),[error,setError]=useState('');
 const [snapshots,setSnapshots]=useState<Snapshot[]>([]),[snapshot,setSnapshot]=useState('');
 const [files,setFiles]=useState<ManagedFile[]>([]),[directory,setDirectory]=useState('/');
 const [selected,setSelected]=useState<string[]>([]),[page,setPage]=useState<ManagedResult|null>(null);
 const [allDevices,setAllDevices]=useState(!!agent.capabilities?.includes('recovery-v2'));
 const [restored,setRestored]=useState(''),[sending,setSending]=useState(false);
 const active=sending||job?.state==='pending'||job?.state==='running';
 const supported=agent.capabilities?.includes('recovery-v1');
 const endpoint='/managed-agents/admin/'+encodeURIComponent(agent.id)+'/jobs';
 const start=async(operation:ManagedOperation,request:ManagedRequest={})=>{
  setSending(true);setError('');setRestored('');
  try{setJob(requireData(await apiFetch<ManagedAgentJob>(endpoint,{method:'POST',body:JSON.stringify({operation,request:{...request,...(agent.capabilities?.includes('recovery-v2')?{allDevices}:{})}})})));void client.invalidateQueries({queryKey:queryKeys.managedAgents})}
  catch(e){setError(e instanceof Error?e.message:'Operation failed')}
  finally{setSending(false)}
 };
 useEffect(()=>{
  if(!job||!['pending','running'].includes(job.state))return;
  let disposed=false;
  const timer=setInterval(async()=>{
   try{
    const result=requireData(await apiFetch<ManagedAgentJob>(endpoint+'/'+job.id));
    if(disposed)return;
    setJob(result);setError('');
    if(result.state==='canceled')setError('Operation canceled. Partial files may remain in the recovery directory.');
    if(result.state==='failed')setError(result.message||'Operation failed. Check the laptop agent log.');
    if(result.state==='success'){
     const data=result.result;
     if(result.operation==='snapshots'){
      if(!data?.snapshots)throw new Error('Update the Windows agent, then Save and connect to enable backup browsing.');
      setSnapshots(old=>data.offset?old.concat(data.snapshots!):data.snapshots!);setPage(data);
     }else if(result.operation==='files'&&data){setFiles(old=>data.offset?old.concat(data.entries||[]):data.entries||[]);setDirectory(data.directory||'/');setPage(data)}
     else if(result.operation==='restore')setRestored(data?.restorePath||'');
     void client.invalidateQueries({queryKey:queryKeys.managedAgents});
    }
   }catch(e){if(!disposed)setError(e instanceof Error?e.message:'Could not read operation status')}
  },2000);
  return()=>{disposed=true;clearInterval(timer)};
 },[job?.id,job?.state,endpoint,client]);
 const browse=(id:string,dir='/')=>{setPage(null);setFiles([]);void start('files',{snapshotId:id,directory:dir})};
 return <details className="rounded-lg border border-slate-600 p-3 space-y-3">
  <summary className="cursor-pointer font-medium">Browse backups and restore</summary>
  <p className="text-sm text-slate-400">A backup saves your files as a snapshot: a version you can restore later. Listing snapshots does not create a backup. Restore all files or select individual files and folders.</p>
  {!supported?<p className="text-amber-300 text-sm">Install the latest Windows app, then click Save and connect to enable restore on this laptop.</p>:<>
   <p className="text-sm text-slate-400">Restores are saved to a new folder on this laptop under C:\ProgramData\FortressBackup\restores. Original files are preserved.</p>
   <label className="block text-sm">Backup source<select aria-label="Backup source device" value={allDevices?'all':'this'} disabled={active||!agent.capabilities?.includes('recovery-v2')} onChange={e=>{setAllDevices(e.target.value==='all');setSnapshot('');setSnapshots([]);setFiles([]);setSelected([]);setPage(null)}} className="block bg-slate-800 p-2 rounded"><option value="all">All devices in this repository (including old enrollments)</option><option value="this">This device only</option></select></label><button className="btn-secondary" disabled={active||agent.disabled} onClick={()=>{setSnapshot('');setFiles([]);setSelected([]);setSnapshots([]);setPage(null);void start('snapshots')}}>Load saved backups</button>
   {snapshots.length>0&&<label className="block text-sm">Saved backup<select aria-label="Saved backup" value={snapshot} disabled={active} onChange={e=>{setSnapshot(e.target.value);setSelected([]);if(e.target.value)browse(e.target.value)}} className="block w-full bg-slate-800 p-2 rounded"><option value="">Choose a saved backup</option>{snapshots.map(s=><option key={s.id} value={s.id}>{new Date(s.time).toLocaleString()} · {s.shortId||s.id.slice(0,8)} · {s.hostname}</option>)}</select></label>}
   {job?.state==='success'&&job.operation==='snapshots'&&snapshots.length===0&&<p>No saved backups found for this laptop.</p>}
   {!snapshot&&page?.hasMore&&<button disabled={active} onClick={()=>void start('snapshots',{offset:snapshots.length})} className="underline">Load more backups</button>}
   {snapshot&&<>
    <div className="flex flex-wrap items-center gap-3"><span className="text-sm break-all">Folder: {directory}</span><button className="underline" disabled={active||directory==='/'} onClick={()=>browse(snapshot,directory.slice(0,directory.lastIndexOf('/'))||'/')}>Up one folder</button></div>
    <ul className="max-h-72 overflow-auto space-y-2" aria-label="Backup files">{files.map(file=><li key={file.path} className="flex gap-3 items-center"><input type="checkbox" aria-label={'Select '+file.name} disabled={active} checked={selected.includes(file.path)} onChange={e=>setSelected(old=>e.target.checked?[...old,file.path]:old.filter(p=>p!==file.path))}/>{file.type==='dir'?<button className="underline break-all" disabled={active} onClick={()=>browse(snapshot,file.path)}>{file.name}/</button>:<span className="break-all">{file.name}</span>}</li>)}</ul>
    {page?.hasMore&&job?.operation==='files'&&<button className="underline" disabled={active} onClick={()=>void start('files',{snapshotId:snapshot,directory,offset:files.length})}>Load more files</button>}
    <div className="flex flex-wrap gap-3"><button className="btn-primary" disabled={active||selected.length===0||selected.length>100} onClick={()=>void start('restore',{snapshotId:snapshot,paths:selected})}>Restore selected ({selected.length})</button><button className="btn-secondary" disabled={active} onClick={()=>void start('restore',{snapshotId:snapshot})}>Restore entire backup</button><button className="underline" disabled={active} onClick={()=>setSelected([])}>Clear selection</button></div>
    {selected.length>100&&<p role="alert">Choose at most 100 files or folders per restore.</p>}
   </>}
  </>}
  {job&&<p role="status" className="text-sm">{operationLabel(job.operation)} · {job.state==='pending'?'Queued; waiting for the laptop agent to check in':job.state==='running'?'Running on the laptop':job.state==='canceled'?'Canceled':job.cancelRequested?'Cancellation requested':job.state==='success'?'Completed':'Failed'}</p>}
  {restored&&<p className="text-green-300 break-all">Files restored on the laptop to: {restored}</p>}
  {error&&<p role="alert" className="text-red-400">{error}</p>}
 </details>;
}
