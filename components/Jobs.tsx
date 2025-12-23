import React, { useState, useMemo } from 'react';
import { BackupJob, BackupTool, RetentionPolicy, JobStatus, JobPriority, System, Location, AIConfig, AIProvider } from '../types';
import {
  Play, Trash2, Plus, Sparkles, Clock, Archive, Settings2, Loader2,
  AlertTriangle, ArrowUp, ArrowDown, Minus, ArrowDownCircle,
  CheckCircle2, XCircle, Circle, X, FileText, Cpu,
  Filter, Server, HardDrive, Edit3, Search, RotateCcw
} from 'lucide-react';
import { generateBackupConfig } from '../services/aiService';
import { RestoreModal } from './RestoreModal';

interface JobsProps {
  jobs: BackupJob[];
  systems: System[];
  locations: Location[];
  aiConfig: AIConfig;
  onAddJob: (job: BackupJob) => void;
  onDeleteJob: (id: string) => void;
  onRunJob: (id: string) => void;
  onUpdateJob?: (job: BackupJob) => void;
}

const TOOL_DESCRIPTIONS: Record<BackupTool, string> = {
  [BackupTool.BORG]: 'Highly efficient deduplicating archiver. Best for storage efficiency.',
  [BackupTool.RESTIC]: 'Modern, fast, and secure. Supports multiple cloud backends.',
  [BackupTool.RSYNC]: 'The industry standard for file synchronization.',
  [BackupTool.RCLONE]: 'The "Swiss army knife" for cloud storage.'
};

const RETENTION_PRESETS = [
  { label: 'Development', policy: { keepHourly: 24, keepDaily: 7, keepWeekly: 0, keepMonthly: 0, keepYearly: 0 } },
  { label: 'Production', policy: { keepHourly: 12, keepDaily: 14, keepWeekly: 8, keepMonthly: 12, keepYearly: 1 } },
  { label: 'Archival', policy: { keepHourly: 0, keepDaily: 30, keepWeekly: 24, keepMonthly: 60, keepYearly: 10 } },
];

const parseCron = (cron: string): string => {
  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;
  const [min, hour, day, month, weekday] = parts;

  if (day === '*' && month === '*' && weekday === '*') {
    return `Daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }
  if (weekday !== '*' && day === '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[parseInt(weekday)] || weekday} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }
  return cron;
};

export const Jobs: React.FC<JobsProps> = ({ jobs, systems, locations, aiConfig, onAddJob, onDeleteJob, onRunJob, onUpdateJob }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<BackupJob | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobLogs, setJobLogs] = useState<Array<{ type: string; message: string; timestamp: string }>>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Restore State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreJob, setRestoreJob] = useState<BackupJob | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');
  const [toolFilter, setToolFilter] = useState<BackupTool | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Fetch logs when job is selected - both historical and live stream
  React.useEffect(() => {
    if (selectedJobId) {
      setLoadingLogs(true);

      // Fetch existing logs
      fetch(`/api/jobs/${selectedJobId}/logs`)
        .then(async res => {
          if (!res.ok) throw new Error(res.statusText);
          const contentType = res.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Invalid content type');
          }
          return res.json();
        })
        .then(data => {
          setJobLogs(Array.isArray(data) ? data : []);
          setLoadingLogs(false);
        })
        .catch(err => {
          console.error("Failed to fetch logs:", err);
          setJobLogs([]);
          setLoadingLogs(false);
        });

      // Subscribe to live log stream via SSE
      // Use relative path to go through the same proxy/origin as fetch
      const eventSource = new EventSource(`/api/jobs/${selectedJobId}/logs/stream`);

      eventSource.onmessage = (event) => {
        try {
          if (!event.data || event.data === 'ping') return;
          const log = JSON.parse(event.data);
          if (log.type === 'complete') {
            eventSource.close();
          } else {
            setJobLogs(prev => [...prev, log]);
          }
        } catch (e) {
          console.warn("Failed to parse SSE message:", event.data);
        }
      };

      eventSource.onerror = (err) => {
        console.warn("SSE Error:", err);
        eventSource.close();
      };

      return () => {
        eventSource.close();
      };
    } else {
      setJobLogs([]);
    }
  }, [selectedJobId]);

  const [formData, setFormData] = useState<{
    name: string; tool: BackupTool; schedule: string; priority: JobPriority;
    retention: RetentionPolicy; sourceId: string; sourcePaths: string[]; destinationId: string;
    repoPassword: string;
  }>({
    name: '', tool: BackupTool.BORG, schedule: '0 2 * * *', priority: JobPriority.MEDIUM,
    retention: { keepHourly: 0, keepDaily: 7, keepWeekly: 4, keepMonthly: 6, keepYearly: 1 },
    sourceId: '', sourcePaths: ['/home'], destinationId: '', repoPassword: ''
  });

  const selectedJob = jobs.find(j => j.id === selectedJobId);

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const matchesSearch = job.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
      const matchesTool = toolFilter === 'all' || job.tool === toolFilter;
      return matchesSearch && matchesStatus && matchesTool;
    });
  }, [jobs, searchQuery, statusFilter, toolFilter]);

  const resetForm = () => {
    setFormData({
      name: '', tool: BackupTool.BORG, schedule: '0 2 * * *', priority: JobPriority.MEDIUM,
      retention: { keepHourly: 0, keepDaily: 7, keepWeekly: 4, keepMonthly: 6, keepYearly: 1 },
      sourceId: '', sourcePaths: ['/home'], destinationId: '', repoPassword: ''
    });
    setEditingJob(null);
    setAiPrompt('');
    setAiError(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (job: BackupJob) => {
    setFormData({
      name: job.name,
      tool: job.tool,
      schedule: job.schedule,
      priority: job.priority,
      retention: job.retention,
      sourceId: job.sourceId,
      sourcePaths: job.sourcePaths || ['/home'],
      destinationId: job.destinationId,
      repoPassword: job.repoPassword || ''
    });
    setEditingJob(job);
    setIsModalOpen(true);
  };

  const openRestoreModal = (job: BackupJob) => {
    setRestoreJob(job);
    setIsRestoreModalOpen(true);
  };

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

  const handleAiGeneration = async () => {
    if (!aiPrompt) return;
    setIsGenerating(true);
    setAiError(null);
    try {
      const cfg = await generateBackupConfig(aiPrompt, aiConfig);
      if (cfg.tool) setFormData(prev => ({ ...prev, ...cfg, name: cfg.jobName || prev.name }));
    } catch (e: any) {
      setAiError(e.message || "Failed to generate config.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = () => {
    if (editingJob && onUpdateJob) {
      onUpdateJob({
        ...editingJob,
        ...formData
      });
    } else {
      onAddJob({
        ...formData,
        id: crypto.randomUUID(),
        status: JobStatus.IDLE,
        nextRun: 'Pending'
      });
    }
    setIsModalOpen(false);
    resetForm();
  };

  const getSystemName = (id: string) => systems.find(s => s.id === id)?.name || 'Unknown';
  const getLocationName = (id: string) => locations.find(l => l.id === id)?.name || 'Unknown';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Backup Streams</h2>
          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">Orchestrated backup jobs</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${showFilters ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'}`}
          >
            <Filter size={16} /> Filters
          </button>
          <button onClick={openCreateModal} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20">
            <Plus size={16} /> Create Job
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      {showFilters && (
        <div className="flex flex-wrap gap-4 p-4 bg-slate-800/40 rounded-2xl border border-slate-700/50 animate-in slide-in-from-top-2 duration-200">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="text"
                placeholder="Search jobs..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white outline-none"
          >
            <option value="all">All Status</option>
            {Object.values(JobStatus).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={toolFilter}
            onChange={e => setToolFilter(e.target.value as any)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white outline-none"
          >
            <option value="all">All Tools</option>
            {Object.values(BackupTool).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {filteredJobs.length === 0 && (
          <div className="py-12 text-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-800/20">
            <Archive size={48} className="mx-auto text-slate-700 mb-4" />
            <h3 className="text-lg font-medium text-slate-400">
              {jobs.length === 0 ? 'No backup jobs yet' : 'No jobs match your filters'}
            </h3>
            <p className="text-slate-500 text-sm mt-2">
              {jobs.length === 0 ? 'Create your first automated backup orchestration.' : 'Try adjusting your search or filter criteria.'}
            </p>
          </div>
        )}
        {filteredJobs.map((job) => (
          <div key={job.id} className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 hover:border-indigo-500/30 transition-all group">
            <div className="flex items-center gap-4 flex-1">
              <div className="p-3 bg-slate-700/50 rounded-lg text-indigo-400 group-hover:bg-indigo-600/10 group-hover:text-indigo-300">
                <Archive size={24} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1 flex-wrap">
                  <h3 className="text-lg font-bold text-slate-100">{job.name}</h3>
                  {getStatusBadge(job.status)}
                  {getPriorityBadge(job.priority)}
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-500 flex-wrap">
                  <span className="flex items-center gap-1" title={TOOL_DESCRIPTIONS[job.tool]}><Settings2 size={12} /> {job.tool}</span>
                  <span className="flex items-center gap-1"><Clock size={12} /> {parseCron(job.schedule)}</span>
                  {job.sourceId && <span className="flex items-center gap-1"><Server size={12} /> {getSystemName(job.sourceId)}</span>}
                  {job.destinationId && <span className="flex items-center gap-1"><HardDrive size={12} /> {getLocationName(job.destinationId)}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => openEditModal(job)} className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-700 rounded-lg transition-colors" title="Edit Job"><Edit3 size={20} /></button>
              <button onClick={() => setSelectedJobId(job.id)} className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-700 rounded-lg transition-colors" title="View Logs"><FileText size={20} /></button>
              <button onClick={() => openRestoreModal(job)} className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors" title="Restore"><RotateCcw size={20} /></button>
              <button onClick={() => onRunJob(job.id)} disabled={job.status === JobStatus.RUNNING} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50" title="Run Now"><Play size={20} /></button>
              <button onClick={() => onDeleteJob(job.id)} className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="Delete"><Trash2 size={20} /></button>
            </div>
          </div>
        ))}
      </div>

      {restoreJob && (
        <RestoreModal
          job={restoreJob}
          systems={systems}
          isOpen={isRestoreModalOpen}
          onClose={() => { setIsRestoreModalOpen(false); setRestoreJob(null); }}
        />
      )}

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">{editingJob ? 'Edit Job' : 'Configure New Job'}</h3>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="text-slate-400 hover:text-white"><X size={24} /></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Job Name</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Web Server Backup" />
                </div>

                {/* Source System Selection */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Source System</label>
                    <select
                      value={formData.sourceId}
                      onChange={e => setFormData({ ...formData, sourceId: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select a system...</option>
                      {systems.map(sys => (
                        <option key={sys.id} value={sys.id}>{sys.name} ({sys.host})</option>
                      ))}
                    </select>
                    {systems.length === 0 && (
                      <p className="text-xs text-amber-400 mt-1">No systems registered. Add systems in Managed Nodes.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Source Paths</label>
                    <div className="space-y-2">
                      {formData.sourcePaths.map((path, idx) => (
                        <div key={idx} className="flex gap-2">
                          <input
                            type="text"
                            value={path}
                            onChange={e => {
                              const newPaths = [...formData.sourcePaths];
                              newPaths[idx] = e.target.value;
                              setFormData({ ...formData, sourcePaths: newPaths });
                            }}
                            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                            placeholder="/home/user/data"
                          />
                          {formData.sourcePaths.length > 1 && (
                            <button
                              onClick={() => setFormData({ ...formData, sourcePaths: formData.sourcePaths.filter((_, i) => i !== idx) })}
                              className="px-3 py-2 bg-rose-500/10 text-rose-400 rounded-lg hover:bg-rose-500/20 transition-colors"
                            >−</button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => setFormData({ ...formData, sourcePaths: [...formData.sourcePaths, ''] })}
                        className="w-full py-2 bg-slate-800 border border-dashed border-slate-600 rounded-lg text-slate-400 text-sm hover:border-indigo-500 hover:text-indigo-400 transition-colors"
                      >+ Add Path</button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">Absolute paths to directories to backup</p>
                  </div>
                </div>

                {/* Destination Location Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Destination Location</label>
                  <select
                    value={formData.destinationId}
                    onChange={e => setFormData({ ...formData, destinationId: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select a location...</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name} ({loc.type})</option>
                    ))}
                  </select>
                  {locations.length === 0 && (
                    <p className="text-xs text-amber-400 mt-1">No locations registered. Add locations in Storage Registry.</p>
                  )}
                  {(() => {
                    const src = systems.find(s => s.id === formData.sourceId);
                    const dst = locations.find(l => l.id === formData.destinationId);

                    if (src?.type === 'remote' && dst?.type === 'nfs') {
                      if (formData.tool === 'rsync') {
                        return (
                          <div className="mt-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg flex gap-3 items-start">
                            <ArrowDownCircle className="text-indigo-400 shrink-0" size={16} />
                            <div className="text-xs text-indigo-200">
                              <strong>Pull Mode Active:</strong> Fortress will connect to <strong>{src.name}</strong> and <u>pull</u> files to this server.
                              <br />
                              Ensure the SSH Key for the source system is configured correctly.
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex gap-3 items-start">
                          <XCircle className="text-rose-400 shrink-0" size={16} />
                          <div className="text-xs text-rose-200">
                            <strong>Configuration Error:</strong> {formData.tool === 'borg' ? 'Borg' : 'Restic'} cannot backup directly to the Fortress server disk from a Remote Source.
                            <br /><br />
                            These tools run on the Source System <strong>({src.name})</strong> and need a network protocol to transfer data here.
                            <br /><br />
                            <strong>Solution:</strong> Add this Fortress server as an <strong>SFTP Location</strong> in Storage Registry to backup here.
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Priority</label>
                    <select value={formData.priority} onChange={e => setFormData({ ...formData, priority: e.target.value as JobPriority })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none">
                      {Object.values(JobPriority).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Schedule (Cron)</label>
                    <input type="text" value={formData.schedule} onChange={e => setFormData({ ...formData, schedule: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm outline-none" />
                    <p className="text-[10px] text-slate-500 mt-1">{parseCron(formData.schedule)}</p>
                  </div>
                </div>

                {/* Repository Passphrase - under Priority, required for Borg, optional for Restic */}
                {(formData.tool === BackupTool.BORG || formData.tool === BackupTool.RESTIC) && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-slate-400 mb-2">
                      Repository Passphrase
                      {formData.tool === BackupTool.BORG && <span className="text-rose-400 ml-1">*</span>}
                    </label>
                    <input
                      type="password"
                      value={formData.repoPassword}
                      onChange={e => setFormData({ ...formData, repoPassword: e.target.value })}
                      placeholder={formData.tool === BackupTool.BORG ? "Required - Enter passphrase for encrypted repository" : "Enter passphrase for encrypted repository"}
                      className={`w-full bg-slate-800 border rounded-lg px-3 py-2 text-white outline-none focus:ring-1 focus:ring-indigo-500 ${formData.tool === BackupTool.BORG && !formData.repoPassword ? 'border-rose-500/50' : 'border-slate-700'}`}
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      {formData.tool === BackupTool.BORG
                        ? 'Required for Borg. All repositories are encrypted with this passphrase.'
                        : 'Required for Restic. The repository will be encrypted with this passphrase.'}
                    </p>
                  </div>
                )}


              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Backup Tool</label>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.values(BackupTool).map(t => (
                      <div key={t} onClick={() => setFormData({ ...formData, tool: t })} className={`p-3 rounded-xl border cursor-pointer transition-all ${formData.tool === t ? 'bg-indigo-600/10 border-indigo-500' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}>
                        <p className="font-bold text-sm text-white mb-1">{t}</p>
                        <p className="text-[10px] text-slate-500 leading-tight">{TOOL_DESCRIPTIONS[t]}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-slate-400">Retention Policy</label>
                    <div className="flex gap-2">
                      {RETENTION_PRESETS.map(p => (
                        <button key={p.label} onClick={() => setFormData({ ...formData, retention: p.policy })} className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded border border-slate-700 text-slate-400">{p.label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {['Hourly', 'Daily', 'Weekly', 'Monthly', 'Yearly'].map(k => (
                      <div key={k}>
                        <span className="text-[10px] text-slate-500 uppercase block mb-1">Keep {k}</span>
                        <input type="number" value={formData.retention[`keep${k}` as keyof RetentionPolicy]} onChange={e => setFormData({ ...formData, retention: { ...formData.retention, [`keep${k}`]: parseInt(e.target.value) || 0 } })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-white text-sm outline-none" />
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`p-4 rounded-xl border transition-all ${aiConfig.provider !== AIProvider.NONE ? 'bg-indigo-600/5 border-indigo-500/20' : 'bg-slate-800/50 border-slate-700/50 opacity-60'}`}>
                  <div className="flex items-center gap-2 text-indigo-400 text-sm font-bold mb-3">
                    <Sparkles size={16} /> {aiConfig.provider !== AIProvider.NONE ? 'AI Architect Suggestion' : 'AI Assistant (Disabled)'}
                  </div>

                  {aiConfig.provider !== AIProvider.NONE ? (
                    <>
                      <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500" rows={3} placeholder="Describe your needs, e.g., 'Backup my database hourly, keep 2 days of archives'" />
                      {aiError && <p className="text-rose-400 text-[10px] mt-2 font-bold uppercase">{aiError}</p>}
                      <button
                        onClick={handleAiGeneration}
                        disabled={isGenerating || !aiPrompt}
                        className="mt-3 w-full py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
                        {isGenerating ? 'Generating...' : `Apply ${aiConfig.provider} Configuration`}
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500 italic">Configure an AI provider in Settings to enable intelligent plan generation.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-800 flex justify-end gap-3 bg-slate-800/20">
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={!formData.name || (formData.tool === BackupTool.BORG && !formData.repoPassword) || (() => {
                  const src = systems.find(s => s.id === formData.sourceId);
                  const dst = locations.find(l => l.id === formData.destinationId);
                  // Allow if tool is Rsync, otherwise block remote->nfs
                  if (src?.type === 'remote' && dst?.type === 'nfs') {
                    return formData.tool !== 'rsync';
                  }
                  return false;
                })()}
                className="px-8 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingJob ? 'Update Job' : 'Create Backup Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Job Details Sidebar */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedJobId(null)} />
          <div className="relative w-full max-w-xl bg-slate-900 border-l border-slate-800 shadow-2xl h-full flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-slate-800 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Job Details</span>
                  {getStatusBadge(selectedJob.status)}
                </div>
                <h2 className="text-2xl font-bold text-white">{selectedJob.name}</h2>
              </div>
              <button onClick={() => setSelectedJobId(null)} className="p-2 hover:bg-slate-800 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-8 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                  <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Source</div>
                  <div className="text-lg font-bold text-white">{selectedJob.sourceId ? getSystemName(selectedJob.sourceId) : 'Not set'}</div>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                  <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Destination</div>
                  <div className="text-lg font-bold text-white">{selectedJob.destinationId ? getLocationName(selectedJob.destinationId) : 'Not set'}</div>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                  <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Avg Speed</div>
                  <div className="text-2xl font-bold text-white">{selectedJob.stats?.speed || 48.2} <span className="text-sm font-normal text-slate-500">MB/s</span></div>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                  <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Dedupe Ratio</div>
                  <div className="text-2xl font-bold text-white">{selectedJob.stats?.dedupeRatio || 4.2}<span className="text-sm font-normal text-slate-500">x</span></div>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-widest">Process Logs</h4>
                <div className="bg-black/30 rounded-lg p-4 font-mono text-[11px] text-slate-400 space-y-1 h-64 overflow-y-auto border border-slate-800">
                  {loadingLogs ? (
                    <div className="text-slate-600 italic">Loading logs...</div>
                  ) : jobLogs.length > 0 ? (
                    jobLogs.map((log, index) => (
                      <div key={index} className={`${log.type === 'error' ? 'text-rose-400 font-bold' : log.type === 'success' ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}>
                        <span className="text-slate-600">[{new Date(log.timestamp).toLocaleTimeString()}]</span> {log.message}
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-600 italic">No logs available. Run the job to see logs here.</div>
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