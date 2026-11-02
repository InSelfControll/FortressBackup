import React,{useEffect,useState} from 'react';
import type {ManagedAgentJob} from '../types';

const duration=(seconds:number)=>`${Math.floor(seconds/60)}m ${Math.floor(seconds%60)}s`;
const bytes=(n:number)=>n>=1073741824?`${(n/1073741824).toFixed(1)} GiB`:n>=1048576?`${(n/1048576).toFixed(1)} MiB`:`${n.toLocaleString()} B`;

export function BackupProgress({job}:{job:ManagedAgentJob}){
 const [now,setNow]=useState(Date.now());
 const running=job.state==='running'&&job.operation==='backup';
 useEffect(()=>{if(!running)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[running]);
 if(!running)return null;
 const p=job.progress,measured=!!p&&p.totalBytes>0;
 const elapsed=job.startedAt?Math.max(0,(now-Date.parse(job.startedAt))/1000):0;
 const stale=p&&now-Date.parse(p.updatedAt)>20000;
 const percent=measured?Math.min(99.9,p!.percentDone*100):undefined;
 return <div className="space-y-1 py-2 text-sm" aria-label="Backup progress details">
  <div className="flex justify-between gap-3"><span>{measured?(p!.percentDone>=1?'Finalizing backup':`${percent!.toFixed(1)}%`):'Backup running'}</span><span>{duration(elapsed)} elapsed</span></div>
  <progress aria-label="Backup progress" className="h-3 w-full accent-indigo-500" max={100} value={percent}/>
  {p?<p className="text-xs text-slate-400">{bytes(p.bytesDone)}{p.totalBytes>0?` of ${bytes(p.totalBytes)}`:' processed'} · {p.filesDone.toLocaleString()} files{p.totalFiles>0?` of ${p.totalFiles.toLocaleString()}`:''}{!stale&&p.secondsRemaining>0?` · about ${duration(p.secondsRemaining)} remaining`:''}</p>:<p className="text-xs text-slate-400">Waiting for measured progress. This agent has not reported a percentage.</p>}
  {stale&&<p className="text-xs text-amber-300">Progress updates delayed. Last update: {new Date(p!.updatedAt).toLocaleTimeString()}.</p>}
 </div>;
}
