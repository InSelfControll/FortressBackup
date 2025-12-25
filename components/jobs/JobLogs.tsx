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

    useEffect(() => {
        if (job) {
            setLoadingLogs(true);

            // Fetch existing logs
            fetch(`/api/jobs/${job.id}/logs`)
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
            const eventSource = new EventSource(`/api/jobs/${job.id}/logs/stream`);

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
    }, [job]);

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
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-xl bg-slate-900 border-l border-slate-800 shadow-2xl h-full flex flex-col animate-in slide-in-from-right duration-300">
                <div className="p-6 border-b border-slate-800 flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Job Details</span>
                            {getStatusBadge(job.status)}
                        </div>
                        <h2 className="text-2xl font-bold text-white">{job.name}</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-8 overflow-y-auto flex-1">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Source</div>
                            <div className="text-lg font-bold text-white">{systemName}</div>
                        </div>
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Destination</div>
                            <div className="text-lg font-bold text-white">{locationName}</div>
                        </div>
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Avg Speed</div>
                            <div className="text-2xl font-bold text-white">{job.stats?.speed || 48.2} <span className="text-sm font-normal text-slate-500">MB/s</span></div>
                        </div>
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Dedupe Ratio</div>
                            <div className="text-2xl font-bold text-white">{job.stats?.dedupeRatio || 4.2}<span className="text-sm font-normal text-slate-500">x</span></div>
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
