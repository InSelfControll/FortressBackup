
import React, { useState, useEffect } from 'react';
import { BackupJob, BackupTool, RetentionPolicy, JobStatus, JobPriority, System, Location } from '../types';
import { 
  Play, Trash2, Plus, Sparkles, Clock, Archive, Settings2, Loader2, 
  Info, RefreshCw, AlertTriangle, Save, ArrowUp, ArrowDown, Minus, 
  Calendar, CheckCircle2, XCircle, Circle, Shield, X, FileText, HardDrive 
} from 'lucide-react';
import { generateBackupConfig } from '../services/geminiService';

interface JobsProps {
  jobs: BackupJob[];
  systems: System[];
  locations: Location[];
  onAddJob: (job: BackupJob) => void;
  onDeleteJob: (id: string) => void;
  onRunJob: (id: string) => void;
}

const TOOL_DESCRIPTIONS: Record<BackupTool, string> = {
  [BackupTool.BORG]: 'Highly efficient deduplicating archiver. Best for storage efficiency on high-frequency backups.',
  [BackupTool.RESTIC]: 'Modern, fast, and secure. Supports multiple cloud backends out of the box natively.',
  [BackupTool.RSYNC]: 'The industry standard for file synchronization. Ideal for simple 1:1 remote mirroring.',
  [BackupTool.RCLONE]: 'The "Swiss army knife" for cloud storage. Best for syncing with S3, B2, or Google Drive.'
};

const RETENTION_PRESETS = [
  { label: 'Development', policy: { keepHourly: 24, keepDaily: 7, keepWeekly: 0, keepMonthly: 0, keepYearly: 0 } },
  { label: 'Production', policy: { keepHourly: 12, keepDaily: 14, keepWeekly: 8, keepMonthly: 12, keepYearly: 1 } },
  { label: 'Archival', policy: { keepHourly: 0, keepDaily: 30, keepWeekly: 24, keepMonthly: 60, keepYearly: 10 } },
];

export const Jobs: React.FC<JobsProps> = ({ jobs, systems, locations, onAddJob, onDeleteJob, onRunJob }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [formData, setFormData] = useState<{
    name: string; tool: BackupTool; schedule: string; priority: JobPriority;
    retention: RetentionPolicy; sourceId: string; destinationId: string;
  }>({
    name: '', tool: BackupTool.BORG, schedule: '0 2 * * *', priority: JobPriority.MEDIUM,
    retention: { keepHourly: 0, keepDaily: 7, keepWeekly: 4, keepMonthly: 6, keepYearly: 1 },
    sourceId: '', destinationId: ''
  });

  const selectedJob = jobs.find(j => j.id === selectedJobId);

  const getPriorityBadge = (priority: JobPriority) => {
    const config = {
      [JobPriority.HIGH]: { color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', icon: ArrowUp },
      [JobPriority.MEDIUM]: { color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: Minus },
      [JobPriority.LOW]: { color: 'text-slate-400 bg-slate-500/10 border-slate-500/20', icon: ArrowDown }
    }[priority];
    const Icon = config.icon;
    return (
      <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${config.color}`}>
        <Icon size={10} /> {priority}
      </span>
    );
  };

  const getStatusBadge = (status: JobStatus) => {
    const config = {
      [JobStatus.SUCCESS]: { color: 'text-emerald-400 bg-emerald-500/10', icon: CheckCircle2, text: 'Success' },
      [JobStatus.FAILED]: { color: 'text-rose-400 bg-rose-500/10', icon: XCircle, text: 'Failed' },
      [JobStatus.RUNNING]: { color: 'text-blue-400 bg-blue-500/10 animate-pulse', icon: Loader2, text: 'Running' },
      [JobStatus.WARNING]: { color: 'text-amber-400 bg-amber-500/10', icon: AlertTriangle, text: 'Warning' },
      [JobStatus.IDLE]: { color: 'text-slate-400 bg-slate-500/10', icon: Circle, text: 'Idle' },
    }[status];
    const Icon = config.icon;
    return (
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border border-transparent ${config.color}`}>
        <Icon size={14} className={status === JobStatus.RUNNING ? 'animate-spin' : ''} />
        <span className="text-xs font-semibold">{config.text}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Backup Jobs</h2>
        <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium text-sm shadow-lg shadow-indigo-500/20">
          <Plus size={16} /> Create Job
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {jobs.map((job) => (
          <div key={job.id} className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 hover:border-indigo-500/30 transition-all group">
            <div className="flex items-center gap-4 flex-1">
              <div className="p-3 bg-slate-700/50 rounded-lg text-indigo-400 group-hover:bg-indigo-600/10 group-hover:text-indigo-300">
                <Archive size={24} />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-lg font-bold text-slate-100">{job.name}</h3>
                  {getStatusBadge(job.status)}
                  {getPriorityBadge(job.priority)}
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-500">
                   <span className="flex items-center gap-1" title={TOOL_DESCRIPTIONS[job.tool]}><Settings2 size={12} /> {job.tool}</span>
                   <span className="flex items-center gap-1"><Clock size={12} /> {job.schedule}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedJobId(job.id)} className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-700 rounded-lg transition-colors" title="View Logs"><FileText size={20} /></button>
              <button onClick={() => onRunJob(job.id)} disabled={job.status === JobStatus.RUNNING} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"><Play size={20} /></button>
              <button onClick={() => onDeleteJob(job.id)} className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"><Trash2 size={20} /></button>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Configure New Job</h3>
              <button onClick={() => setIsModalOpen(false)}><X size={24} /></button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8">
               <div className="space-y-6">
                 <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Job Name</label>
                    <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Web Server Backup"/>
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Backup Tool</label>
                    <div className="grid grid-cols-2 gap-3">
                       {Object.values(BackupTool).map(t => (
                         <div key={t} onClick={() => setFormData({...formData, tool: t})} className={`p-3 rounded-xl border cursor-pointer transition-all ${formData.tool === t ? 'bg-indigo-600/10 border-indigo-500' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}>
                           <p className="font-bold text-sm text-white mb-1">{t}</p>
                           <p className="text-[10px] text-slate-500 leading-tight">{TOOL_DESCRIPTIONS[t]}</p>
                         </div>
                       ))}
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Priority</label>
                      <select value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value as JobPriority})} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none">
                        {Object.values(JobPriority).map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Schedule (Cron)</label>
                      <input type="text" value={formData.schedule} onChange={e => setFormData({...formData, schedule: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm outline-none"/>
                    </div>
                 </div>
               </div>

               <div className="space-y-6">
                 <div>
                    <div className="flex justify-between items-center mb-2">
                       <label className="block text-sm font-medium text-slate-400">Retention Policy</label>
                       <div className="flex gap-2">
                         {RETENTION_PRESETS.map(p => (
                           <button key={p.label} onClick={() => setFormData({...formData, retention: p.policy})} className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded border border-slate-700 text-slate-400">{p.label}</button>
                         ))}
                       </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                       {['Hourly', 'Daily', 'Weekly', 'Monthly', 'Yearly'].map(k => (
                         <div key={k}>
                           <span className="text-[10px] text-slate-500 uppercase block mb-1">Keep {k}</span>
                           <input type="number" value={formData.retention[`keep${k}` as keyof RetentionPolicy]} onChange={e => setFormData({...formData, retention: {...formData.retention, [`keep${k}`]: parseInt(e.target.value) || 0}})} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-white text-sm outline-none"/>
                         </div>
                       ))}
                    </div>
                 </div>
                 <div className="bg-indigo-600/5 border border-indigo-500/20 p-4 rounded-xl">
                   <div className="flex items-center gap-2 text-indigo-400 text-sm font-bold mb-3"><Sparkles size={16}/> AI Architect Suggestion</div>
                   <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500" rows={3} placeholder="Describe your needs, e.g., 'Backup my database hourly, keep 2 days of archives'"/>
                   <button onClick={async () => {
                     setIsGenerating(true);
                     const cfg = await generateBackupConfig(aiPrompt);
                     setFormData(prev => ({...prev, ...cfg}));
                     setIsGenerating(false);
                   }} disabled={isGenerating} className="mt-3 w-full py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white text-xs font-bold transition-all disabled:opacity-50">
                     {isGenerating ? 'Generating...' : 'Apply AI Configuration'}
                   </button>
                 </div>
               </div>
            </div>

            <div className="p-6 border-t border-slate-800 flex justify-end gap-3 bg-slate-800/20">
               <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Cancel</button>
               <button onClick={() => {
                 onAddJob({...formData, id: crypto.randomUUID(), status: JobStatus.IDLE, nextRun: 'Pending'});
                 setIsModalOpen(false);
               }} className="px-8 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-lg shadow-indigo-500/20">Create Backup Plan</button>
            </div>
          </div>
        </div>
      )}

      {selectedJob && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedJobId(null)}/>
          <div className="relative w-full max-w-xl bg-slate-900 border-l border-slate-800 shadow-2xl h-full flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-slate-800 flex justify-between items-start">
               <div>
                 <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Job Details</span>
                    {getStatusBadge(selectedJob.status)}
                 </div>
                 <h2 className="text-2xl font-bold text-white">{selectedJob.name}</h2>
               </div>
               <button onClick={() => setSelectedJobId(null)} className="p-2 hover:bg-slate-800 rounded-lg"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-8 overflow-y-auto">
               <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Avg Speed</div>
                    <div className="text-2xl font-bold text-white">48.2 <span className="text-sm font-normal text-slate-500">MB/s</span></div>
                  </div>
                  <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Dedupe Ratio</div>
                    <div className="text-2xl font-bold text-white">4.2<span className="text-sm font-normal text-slate-500">x</span></div>
                  </div>
               </div>
               <div>
                  <h4 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-widest">Process Logs</h4>
                  <div className="bg-black/30 rounded-lg p-4 font-mono text-[11px] text-slate-400 space-y-1 h-64 overflow-y-auto border border-slate-800">
                     <div className="text-indigo-400">[INFO] Connection established to remote host...</div>
                     <div className="text-indigo-400">[INFO] Initializing {selectedJob.tool} repository...</div>
                     <div>[SCAN] 12,402 files detected in source...</div>
                     <div>[DEDUP] Chunking file: /var/log/syslog (12MB)</div>
                     <div>[DEDUP] Chunking file: /home/alex/db_dump.sql (4.2GB)</div>
                     {selectedJob.status === JobStatus.FAILED ? (
                       <div className="text-rose-400 mt-2 font-bold">[ERROR] Pipe failed: Write error on remote backend (Insufficient space)</div>
                     ) : (
                       <div className="text-emerald-400 mt-2 font-bold">[SUCCESS] Snapshotted successfully (ID: 4a2b3c)</div>
                     )}
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
