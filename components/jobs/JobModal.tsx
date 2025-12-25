import React, { useState, useEffect } from 'react';
import { BackupJob, BackupTool, JobPriority, RetentionPolicy, System, Location, AIConfig, AIProvider, JobStatus } from '../../types';
import { useCreateJob, useUpdateJob } from '../../client/api/mutations';
import { generateBackupConfig } from '../../client/api/ai';
import { Sparkles, Loader2, Cpu, ArrowDownCircle, XCircle, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface JobModalProps {
    job: BackupJob | null;
    isOpen: boolean;
    onClose: () => void;
    systems: System[];
    locations: Location[];
    aiConfig: AIConfig;
}

const RETENTION_PRESETS = [
    { label: 'Development', policy: { keepHourly: 24, keepDaily: 7, keepWeekly: 0, keepMonthly: 0, keepYearly: 0 } },
    { label: 'Production', policy: { keepHourly: 12, keepDaily: 14, keepWeekly: 8, keepMonthly: 12, keepYearly: 1 } },
    { label: 'Archival', policy: { keepHourly: 0, keepDaily: 30, keepWeekly: 24, keepMonthly: 60, keepYearly: 10 } },
];

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

export const JobModal: React.FC<JobModalProps> = ({ job, isOpen, onClose, systems, locations, aiConfig }) => {
    const createJobMutation = useCreateJob();
    const updateJobMutation = useUpdateJob();

    const [formData, setFormData] = useState<{
        name: string; tool: BackupTool; schedule: string; priority: JobPriority;
        retention: RetentionPolicy; sourceId: string; sourcePaths: string[]; destinationId: string;
        repoPassword: string;
    }>({
        name: '', tool: BackupTool.BORG, schedule: '0 2 * * *', priority: JobPriority.MEDIUM,
        retention: { keepHourly: 0, keepDaily: 7, keepWeekly: 4, keepMonthly: 6, keepYearly: 1 },
        sourceId: '', sourcePaths: ['/home'], destinationId: '', repoPassword: ''
    });

    const [aiPrompt, setAiPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    useEffect(() => {
        if (job) {
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
        } else {
            setFormData({
                name: '', tool: BackupTool.BORG, schedule: '0 2 * * *', priority: JobPriority.MEDIUM,
                retention: { keepHourly: 0, keepDaily: 7, keepWeekly: 4, keepMonthly: 6, keepYearly: 1 },
                sourceId: '', sourcePaths: ['/home'], destinationId: '', repoPassword: ''
            });
        }
    }, [job, isOpen]);

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
        if (job) {
            updateJobMutation.mutate({
                ...job,
                ...formData
            }, {
                onSuccess: () => {
                    onClose();
                    toast.success('Job updated successfully');
                },
                onError: () => toast.error('Failed to update job')
            });
        } else {
            createJobMutation.mutate({
                ...formData,
                status: JobStatus.IDLE,
                nextRun: 'Pending'
            } as any, {
                onSuccess: () => {
                    onClose();
                    toast.success('Job created successfully');
                },
                onError: () => toast.error('Failed to create job')
            });
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-white">{job ? 'Edit Job' : 'Configure New Job'}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={24} /></button>
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

                        {/* Repository Passphrase */}
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
                    <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Cancel</button>
                    <button
                        onClick={handleSubmit}
                        disabled={!formData.name || (formData.tool === BackupTool.BORG && !formData.repoPassword) || (() => {
                            const src = systems.find(s => s.id === formData.sourceId);
                            const dst = locations.find(l => l.id === formData.destinationId);
                            if (src?.type === 'remote' && dst?.type === 'nfs') {
                                return formData.tool !== 'rsync';
                            }
                            return false;
                        })()}
                        className="px-8 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {job ? 'Update Job' : 'Create Backup Plan'}
                    </button>
                </div>
            </div>
        </div>
    );
};
