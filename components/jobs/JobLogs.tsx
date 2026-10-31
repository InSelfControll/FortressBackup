import { apiFetch, requireData, getToken, API_BASE } from '../../client/api/client';
import { queryClient } from '../../client/query';
import { queryKeys } from '../../client/api/queries';
import React, { useState, useEffect } from 'react';
import { BackupJob, JobStatus, System, Location } from '../../types';
import { X, CheckCircle2, XCircle, Loader2, AlertTriangle, Circle } from 'lucide-react';

interface JobLogsProps {
    job: BackupJob;
    onClose: () => void;
    systemName: string;
    locationName: string;
}

export const JobLogs: React.FC<JobLogsProps> = ({ job, onClose, systemName, locationName }) => {
    const [jobLogs, setJobLogs] = useState<Array<{ type: string; message: string; timestamp: string }>>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);

    const [loadError, setLoadError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        setJobLogs([]); setLoadingLogs(true); setLoadError('');
        const load = async () => {
            try {
                const existing = requireData(await apiFetch<Array<{type:string;message:string;timestamp:string}>>(`/jobs/${job.id}/logs`, { signal: controller.signal }));
                if (controller.signal.aborted) return;
                setJobLogs(Array.isArray(existing) ? existing.slice(-2000) : []);
                setLoadingLogs(false);
                if (job.status !== JobStatus.RUNNING) return;
                const token = getToken();
                const response = await fetch(`${API_BASE}/jobs/${job.id}/logs/stream`, {
                    signal: controller.signal, headers: token ? { Authorization: `Bearer ${token}` } : {}
                });
                if (!response.ok || !response.body) throw new Error('Live logs are unavailable. Reopen the log panel after the backup completes.');
                const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffered = '';
                while (!controller.signal.aborted) {
                    const {value,done} = await reader.read(); if (done) break;
                    buffered += decoder.decode(value, {stream:true});
                    const events = buffered.split('\n\n'); buffered = events.pop() || '';
                    if (buffered.length > 131072) throw new Error('Live log event exceeded the size limit');
                    for (const event of events) {
                        const line = event.split('\n').find(line=>line.startsWith('data: '));
                        if (!line) continue;
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'complete') { void queryClient.invalidateQueries({queryKey:queryKeys.jobs}); continue; }
                        if (typeof data.message === 'string') setJobLogs(previous=>[...previous,data].slice(-2000));
                    }
                }
            } catch(error) {
                if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'Logs could not be loaded');
            } finally { if (!controller.signal.aborted) setLoadingLogs(false); }
        };
        void load();
        return () => controller.abort();
    }, [job.id, job.status]);

    const getStatusBadge = (status: JobStatus) => {
        const config = {
            [JobStatus.SUCCESS]: { color: 'text-emerald-400 bg-emerald-500/10', icon: CheckCircle2, text: 'Success' },
            [JobStatus.FAILED]: { color: 'text-rose-400 bg-rose-500/10', icon: XCircle, text: 'Failed' },
            [JobStatus.RUNNING]: { color: 'text-blue-400 bg-blue-500/10 animate-pulse', icon: Loader2, text: 'Running' },
            [JobStatus.REVIEW_REQUIRED]: { color: 'text-amber-400 bg-amber-500/10', icon: AlertTriangle, text: 'Review required' },
            [JobStatus.WARNING]: { color: 'text-amber-400 bg-amber-500/10', icon: AlertTriangle, text: 'Warning' },
            [JobStatus.IDLE]: { color: 'text-slate-400 bg-slate-500/10', icon: Circle, text: 'Idle' },
        }[status] || { color: 'text-slate-400 bg-slate-500/10', icon: Circle, text: String(status) };
        const Icon = config.icon;
        return (
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border border-transparent ${config.color}`}>
                <Icon size={14} className={status === JobStatus.RUNNING ? 'animate-spin' : ''} />
                <span className="text-xs font-semibold">{config.text}</span>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div role="dialog" aria-modal="true" aria-label="Job details" className="relative w-full max-w-xl bg-slate-900 border-l border-slate-800 shadow-2xl h-full flex flex-col animate-in slide-in-from-right duration-300">
                <div className="p-4 sm:p-6 shrink-0 border-b border-slate-800 flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Job Details</span>
                            {getStatusBadge(job.status)}
                        </div>
                        <h2 className="text-2xl break-words font-bold text-white">{job.name}</h2>
                    </div>
                    <button onClick={onClose} aria-label="Close job details" className="p-3 shrink-0 hover:bg-slate-800 rounded-lg"><X size={20} /></button>
                </div>
                <div className="p-4 sm:p-6 min-h-0 space-y-8 overflow-y-auto flex-1">
                    {loadError && <p role="alert" className="text-sm text-rose-400">{loadError}</p>}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Source</div>
                            <div className="text-lg break-words font-bold text-white">{systemName}</div>
                        </div>
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Destination</div>
                            <div className="text-lg break-words font-bold text-white">{locationName}</div>
                        </div>
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Avg Speed</div>
                            <div className="text-2xl break-words font-bold text-white">{job.stats?.speed ?? '—'} <span className="text-sm font-normal text-slate-500">MB/s</span></div>
                        </div>
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Dedupe Ratio</div>
                            <div className="text-2xl break-words font-bold text-white">{job.stats?.dedupeRatio ?? '—'}<span className="text-sm font-normal text-slate-500">x</span></div>
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
    );
};
