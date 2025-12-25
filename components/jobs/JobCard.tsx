import React from 'react';
import { BackupJob, JobStatus, JobPriority, BackupTool } from '../../types';
import { Archive, Edit3, FileText, RotateCcw, Play, Trash2, Settings2, Clock, Server, HardDrive, CheckCircle2, XCircle, Loader2, AlertTriangle, Circle, ArrowUp, Minus, ArrowDown } from 'lucide-react';

interface JobCardProps {
    job: BackupJob;
    systemName: string;
    locationName: string;
    onEdit: (job: BackupJob) => void;
    onViewLogs: (id: string) => void;
    onRestore: (job: BackupJob) => void;
    onRun: (id: string) => void;
    onDelete: (id: string) => void;
    isRunning: boolean;
    isRunPending: boolean;
}

const TOOL_DESCRIPTIONS: Record<BackupTool, string> = {
    [BackupTool.BORG]: 'Highly efficient deduplicating archiver. Best for storage efficiency.',
    [BackupTool.RESTIC]: 'Modern, fast, and secure. Supports multiple cloud backends.',
    [BackupTool.RSYNC]: 'The industry standard for file synchronization.',
    [BackupTool.RCLONE]: 'The "Swiss army knife" for cloud storage.'
};

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

export const JobCard: React.FC<JobCardProps> = ({
    job, systemName, locationName, onEdit, onViewLogs, onRestore, onRun, onDelete, isRunning, isRunPending
}) => {

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

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 hover:border-indigo-500/30 transition-all group">
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
                        {job.sourceId && <span className="flex items-center gap-1"><Server size={12} /> {systemName}</span>}
                        {job.destinationId && <span className="flex items-center gap-1"><HardDrive size={12} /> {locationName}</span>}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={() => onEdit(job)} className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-700 rounded-lg transition-colors" title="Edit Job"><Edit3 size={20} /></button>
                <button onClick={() => onViewLogs(job.id)} className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-700 rounded-lg transition-colors" title="View Logs"><FileText size={20} /></button>
                <button onClick={() => onRestore(job)} className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors" title="Restore"><RotateCcw size={20} /></button>
                <button onClick={() => onRun(job.id)} disabled={isRunning || isRunPending} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50" title="Run Now"><Play size={20} /></button>
                <button onClick={() => onDelete(job.id)} className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="Delete"><Trash2 size={20} /></button>
            </div>
        </div>
    );
};
