import React, { useState, useEffect, useMemo } from 'react';
import { X, Clock, Server, FolderInput, CheckCircle2, AlertTriangle, Loader2, RotateCcw, Search } from 'lucide-react';
import {ManagedRestore} from './ManagedRestore';
import {useManagedAgents} from '../client/api/queries';
import {apiFetch,requireData} from '../client/api/client';
import type {ManagedAgentJob} from '../types';
import { BackupJob, System, Snapshot } from '../types';

interface RestoreModalProps {
    job: BackupJob;
    systems: System[];
    isOpen: boolean;
    onClose: () => void;
}

interface RestorePayloadInput {
    snapshotId: string;
    restorePath: string;
    systemId: string;
    fileSelectionMode: 'all' | 'specific';
    selectedFiles: string[];
}

export const buildRestorePayload = ({
    snapshotId,
    restorePath,
    systemId,
    fileSelectionMode,
    selectedFiles,
}: RestorePayloadInput) => {
    const payload: any = { snapshotId, restorePath, systemId };
    if (fileSelectionMode === 'specific') {
        payload.paths = selectedFiles;
    }
    return payload;
};

export const canStartRestore = (
    restorePath: string,
    fileSelectionMode: 'all' | 'specific',
    selectedFiles: string[]
) => restorePath.startsWith('/') && restorePath !== '/' && !restorePath.split('/').includes('..') && (fileSelectionMode === 'all' || selectedFiles.length > 0);

export const RestoreModal: React.FC<RestoreModalProps> = ({ job, systems, isOpen, onClose }) => {
    const managedAgents=useManagedAgents();
    const [managedJob,setManagedJob]=useState<ManagedAgentJob|null>(null);
    const [step, setStep] = useState<'snapshots' | 'config' | 'restoring' | 'result'>('snapshots');
    const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);
    const [fileSelectionMode, setFileSelectionMode] = useState<'all' | 'specific'>('all');
    const [files, setFiles] = useState<any[]>([]);
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
    const [filesLoaded, setFilesLoaded] = useState(false);
    const [fileSearchQuery, setFileSearchQuery] = useState('');

    const [restorePath, setRestorePath] = useState('');
    const [targetSystemId, setTargetSystemId] = useState('');
    const windows=targetSystemId.startsWith('windows:');
    const recoveryDevice=managedAgents.data?.find(agent=>'windows:'+agent.id===targetSystemId);
    const [restoreLogs, setRestoreLogs] = useState<string[]>([]);
    const [restoreSuccess, setRestoreSuccess] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchSnapshots();
            setRestorePath('');setManagedJob(null);
            setTargetSystemId(job.sourceId);
            setStep('snapshots');
            setError(null);
            setRestoreLogs([]);
            setFileSelectionMode('all');
            setFiles([]);
            setSelectedFiles([]);
            setFilesLoaded(false);
            setFileSearchQuery('');
        }
    }, [isOpen, job.id]);

    const fetchSnapshots = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('fortress_token');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

            const res = await fetch(`/api/jobs/${job.id}/snapshots`, { headers });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Failed to fetch snapshots: ${res.status} ${text.substring(0, 100)}`);
            }

            const contentType = res.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Server returned invalid content type (not JSON)');
            }

            const data = await res.json();
            setSnapshots(Array.isArray(data) ? data : []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchFiles = async (snapshotId: string) => {
        setLoadingFiles(true);
        setError(null);
        try {
            const token = localStorage.getItem('fortress_token');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            const res = await fetch(`/api/jobs/${job.id}/snapshots/${snapshotId}/files`, { headers });

            if (!res.ok) throw new Error('Failed to fetch file list');

            const data = await res.json();
            setFiles(Array.isArray(data) ? data : []);
            setFilesLoaded(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoadingFiles(false);
        }
    };

    const handleSnapshotSelect = (snap: Snapshot) => {
        setError(null);
        setSelectedSnapshot(snap);
        setStep('config');
        setRestorePath(`/tmp/restore_${snap.shortId}`);
        // Reset file selection state
        setFileSelectionMode('all');
        setFilesLoaded(false);
        setFiles([]);
        setSelectedFiles([]);
        setFileSearchQuery('');
    };

    // Filter files based on search query
    const filteredFiles = useMemo(() => {
        if (!fileSearchQuery.trim()) return files;
        const query = fileSearchQuery.toLowerCase();
        return files.filter(file => file.path.toLowerCase().includes(query));
    }, [files, fileSearchQuery]);

    const toggleFileSelection = (path: string) => {
        setSelectedFiles(prev =>
            prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
        );
    };

    useEffect(()=>{
      if(!isOpen||step!=='restoring'||!managedJob||!['pending','running'].includes(managedJob.state))return;
      let disposed=false;const timer=setInterval(async()=>{
       try{const result=requireData(await apiFetch<ManagedAgentJob>('/managed-agents/admin/'+targetSystemId.slice(8)+'/jobs/'+managedJob.id));if(disposed)return;setManagedJob(result);
        setRestoreLogs([result.cancelRequested?'Cancellation requested':result.state==='pending'?'Queued; waiting for the Windows agent':result.state==='running'?'Restoring on the Windows device':result.message||result.state]);
        if(!['pending','running'].includes(result.state)){setRestoreSuccess(result.state==='success');setError(result.state==='success'?null:result.state==='canceled'?'Restore canceled':result.message||'Restore failed');if(result.result?.restorePath)setRestoreLogs(['Restored on the Windows device to: '+result.result.restorePath]);setStep('result')}
       }catch(e){if(!disposed)setError(e instanceof Error?e.message:'Could not read Windows restore status')}
      },2000);return()=>{disposed=true;clearInterval(timer)};
    },[isOpen,step,managedJob?.id,managedJob?.state,targetSystemId]);
    const handleRestore = async () => {
        if (!selectedSnapshot || !canStartRestore(windows?'/managed-recovery':restorePath, fileSelectionMode, selectedFiles)) return;

        if (step === 'restoring') return;
        setStep('restoring');
        setError(null);
        setRestoreLogs(['Initiating restore process...']);

        try {
            const token = localStorage.getItem('fortress_token');
            const headers = token ? {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            } : {
                'Content-Type': 'application/json'
            };

            const payload = buildRestorePayload({
                snapshotId: selectedSnapshot.id,
                restorePath,
                systemId: targetSystemId,
                fileSelectionMode,
                selectedFiles
            });

            if(windows){delete payload.systemId;delete payload.restorePath;payload.managedAgentId=targetSystemId.slice(8)}
            const res = await fetch(`/api/jobs/${job.id}/restore`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const text = await res.text();
                let message = `Restore failed (HTTP ${res.status})`;
                try { message = JSON.parse(text).error || message; } catch { /* Preserve a bounded status message. */ }
                throw new Error(message);
            }

            const data = await res.json();

            if(windows&&data.id){setManagedJob(data);setRestoreLogs(['Restore queued for Windows; waiting for the agent to check in.']);return}
            if (data.success) {
                setRestoreSuccess(true);
                setStep('result');
            } else {
                setRestoreSuccess(false);
                setError(data.error || 'Restore failed');
                setStep('result');
            }

            if (data.logs && Array.isArray(data.logs)) {
                setRestoreLogs(data.logs.map((l: any) => `[${l.type}] ${l.message}`));
            }

        } catch (err: any) {
            setError(err.message);
            setStep('result');
            setRestoreSuccess(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div role="dialog" aria-modal="true" aria-label="Restore backup" className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-4 shrink-0 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${step === 'result' ? (restoreSuccess ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400') : 'bg-indigo-500/10 text-indigo-400'}`}>
                            <RotateCcw size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Restore Backup</h3>
                            <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">{job.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close dialog" className="p-3 shrink-0 text-slate-400 hover:text-white"><X size={20} /></button>
                </div>

                {managedJob&&step==='restoring'&&<button className="m-4 btn-secondary" disabled={managedJob.cancelRequested} onClick={async()=>{try{setManagedJob(requireData(await apiFetch<ManagedAgentJob>('/managed-agents/admin/'+targetSystemId.slice(8)+'/jobs/'+managedJob.id+'/cancel',{method:'POST',body:'{}'})))}catch(e){setError(e instanceof Error?e.message:'Cancellation failed')}}}>Cancel restore</button>}
                {step==='snapshots'&&<div className="px-4 pt-4"><label className="block text-sm">Restore destination device<select aria-label="Restore destination device" value={targetSystemId} onChange={e=>setTargetSystemId(e.target.value)} className="block w-full bg-slate-800 p-2 rounded"><optgroup label="Linux / SSH systems">{systems.map(system=><option key={system.id} value={system.id}>{system.name} (SSH)</option>)}</optgroup><optgroup label="Windows managed devices">{(managedAgents.data||[]).filter(agent=>!agent.disabled).map(agent=><option key={agent.id} value={'windows:'+agent.id}>{agent.name} (Windows)</option>)}</optgroup></select></label><p className="text-sm text-slate-400 mt-2">Choose a Windows recovery device to browse this repository even when the original device is offline.</p></div>}
                {/* Content */}
                <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
                    {step==='snapshots'&&windows&&recoveryDevice?<div className="space-y-4"><h4>Restore on {recoveryDevice.name}</h4>{recoveryDevice.repositoryJobId!==job.id?<p role="alert">Assign “{job.name}” as this device's saved repository in Managed Clients, then Save and connect on that device before recovering these backups.</p>:<ManagedRestore agent={recoveryDevice} open/>}</div>:step === 'snapshots' && (
                        <div className="space-y-4">
                            <h4 className="text-sm font-medium text-slate-400 uppercase tracking-widest">Select a saved backup (snapshot)</h4><p className="text-sm text-slate-400">A backup saves a snapshot: a version of your files at that time. Choose one to restore all files or selected files and folders.</p>
                            {loading ? (
                                <div className="flex items-center justify-center py-12 text-slate-500 gap-2">
                                    <Loader2 className="animate-spin" size={20} /> Loading snapshots...
                                </div>
                            ) : error ? (
                                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm flex gap-3 items-center">
                                    <AlertTriangle size={20} /> <span role="alert">{error}</span><button onClick={() => void fetchSnapshots()} className="underline">Retry snapshots</button>
                                </div>
                            ) : snapshots.length === 0 ? (
                                <div className="text-center py-12 text-slate-500 italic">No snapshots found for this job.</div>
                            ) : (
                                <div className="grid gap-2">
                                    {snapshots.map(snap => (
                                        <button
                                            key={snap.id}
                                            onClick={() => handleSnapshotSelect(snap)}
                                            className="flex items-center justify-between p-4 bg-slate-800 border border-slate-700 rounded-xl hover:border-indigo-500 hover:bg-slate-800/80 transition-all text-left group"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="p-2 bg-slate-700 rounded-lg text-slate-400 group-hover:text-indigo-400 transition-colors">
                                                    <Clock size={16} />
                                                </div>
                                                <div>
                                                    <div className="text-white font-mono text-sm">{snap.time}</div>
                                                    <div className="text-xs text-slate-500 text-ellipsis overflow-hidden max-w-[200px]">{snap.shortId}</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs text-slate-400 bg-slate-900 px-2 py-1 rounded inline-block">{snap.paths.length} paths</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 'config' && selectedSnapshot && (
                        <div className="space-y-6">
                            <div className="bg-indigo-500/5 border border-indigo-500/10 p-4 rounded-xl flex items-center gap-4">
                                <Clock className="text-indigo-400" size={20} />
                                <div>
                                    <div className="text-xs text-indigo-300 uppercase font-bold">Selected Snapshot</div>
                                    <div className="text-white font-mono">{selectedSnapshot.time} <span className="text-indigo-500/50">|</span> {selectedSnapshot.shortId}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Left Column: Destination */}
                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold text-slate-300 border-b border-slate-700 pb-2">Destination</h4>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Target System</label>
                                        <div className="relative">
                                            <Server className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                            <select
                                                value={targetSystemId}
                                                onChange={e => setTargetSystemId(e.target.value)}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500 appearance-none text-sm"
                                            >
                                                <optgroup label="Linux / SSH systems">{systems.map(sys => (
                                                    <option key={sys.id} value={sys.id}>{sys.name} ({sys.host})</option>
                                                ))}</optgroup><optgroup label="Windows managed devices">{(managedAgents.data||[]).filter(agent=>!agent.disabled).map(agent=><option key={agent.id} value={'windows:'+agent.id}>{agent.name} (Windows{agent.lastSeen?'':' — awaiting setup'})</option>)}</optgroup>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Restore Location</label>
                                        <div className="relative">
                                            <FolderInput className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                            <input
                                                type="text"
                                                readOnly={windows}
                                                value={windows?'New protected recovery folder on the Windows device':restorePath}
                                                onChange={e => setRestorePath(e.target.value)}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                                                placeholder="/tmp/restored_files"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: File Selection */}
                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold text-slate-300 border-b border-slate-700 pb-2">Content</h4>

                                    <div className="flex gap-2 bg-slate-800/50 p-1 rounded-lg">
                                        <button
                                            onClick={() => setFileSelectionMode('all')}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${fileSelectionMode === 'all' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                        >
                                            All Files
                                        </button>
                                        <button
                                            onClick={() => {
                                                setFileSelectionMode('specific');
                                                if (!filesLoaded) fetchFiles(selectedSnapshot.id);
                                            }}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${fileSelectionMode === 'specific' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                        >
                                            Specific Files
                                        </button>
                                    </div>

                                    {fileSelectionMode === 'specific' && (
                                        <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex flex-col">
                                            {error && <p role="alert" className="p-3 text-sm text-rose-400">{error}<button onClick={() => void fetchFiles(selectedSnapshot.id)} className="ml-2 underline">Retry files</button></p>}
                                            {/* Search Input */}
                                            <div className="p-2 border-b border-slate-800">
                                                <div className="relative">
                                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                                                    <input
                                                        type="text"
                                                        value={fileSearchQuery}
                                                        onChange={e => setFileSearchQuery(e.target.value)}
                                                        placeholder="Search paths..."
                                                        className="w-full bg-slate-900 border border-slate-700 rounded-md pl-8 pr-3 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-500"
                                                    />
                                                </div>
                                            </div>
                                            {loadingFiles ? (
                                                <div className="flex items-center justify-center h-40 text-slate-500 gap-2">
                                                    <Loader2 className="animate-spin" size={16} /> Loading file list...
                                                </div>
                                            ) : (
                                                <div className="overflow-y-auto p-2 space-y-1 h-40">
                                                    {filteredFiles.map((file, idx) => (
                                                        <label key={idx} className="flex items-start gap-2 p-1.5 hover:bg-slate-800 rounded cursor-pointer group">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedFiles.includes(file.path)}
                                                                onChange={() => toggleFileSelection(file.path)}
                                                                className="mt-1 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500/50"
                                                            />
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-xs text-slate-300 font-mono break-all group-hover:text-white">{file.path}</div>
                                                                <div className="text-[10px] text-slate-600 flex gap-2">
                                                                    <span>{file.type}</span>
                                                                    <span>{(file.size / 1024).toFixed(1)} KB</span>
                                                                </div>
                                                            </div>
                                                        </label>
                                                    ))}
                                                    {files.length > 0 && filteredFiles.length === 0 && (
                                                        <div className="text-center py-6 text-xs text-slate-600">No files match "{fileSearchQuery}"</div>
                                                    )}
                                                    {files.length === 0 && (
                                                        <div className="text-center py-6 text-xs text-slate-600">No files found</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {fileSelectionMode === 'specific' && (
                                        <div className="text-[10px] text-slate-500 text-right">
                                            {selectedFiles.length} files selected
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {(step === 'restoring' || step === 'result') && (
                        <div className="space-y-6">
                            <div className={`p-4 rounded-xl border flex items-center gap-4 ${step === 'restoring' ? 'bg-blue-500/10 border-blue-500/20' : restoreSuccess ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
                                {step === 'restoring' ? (
                                    <Loader2 className="animate-spin text-blue-400" size={24} />
                                ) : restoreSuccess ? (
                                    <CheckCircle2 className="text-emerald-400" size={24} />
                                ) : (
                                    <AlertTriangle className="text-rose-400" size={24} />
                                )}
                                <div>
                                    <h4 className={`font-bold ${step === 'restoring' ? 'text-blue-400' : restoreSuccess ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {step === 'restoring' ? 'Restoring files...' : restoreSuccess ? 'Restore Completed Successfully' : 'Restore Failed'}
                                    </h4>
                                    <p className="text-xs text-slate-400">
                                        {step === 'restoring' ? 'Please wait while data is being transferred.' : restoreSuccess ? 'Your files have been restored to the target directory.' : error || 'Check the logs below for details.'}
                                    </p>
                                </div>
                            </div>

                            <div className="bg-black/40 rounded-lg border border-slate-800 p-4 font-mono text-[10px] h-64 overflow-y-auto text-slate-400">
                                {restoreLogs.map((log, i) => (
                                    <div key={i} className="mb-1">{log}</div>
                                ))}
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="p-4 shrink-0 border-t border-slate-800 flex flex-wrap gap-3 justify-between items-center bg-slate-800/30">
                    {step === 'snapshots' && (
                        <div className="text-xs text-slate-500">Select a snapshot to continue</div>
                    )}
                    {step === 'config' && (
                        <button onClick={() => setStep('snapshots')} className="text-slate-400 hover:text-white text-sm">Back</button>
                    )}

                    <div className="flex gap-3 ml-auto">
                        {step !== 'restoring' && (
                            <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm">Cancel</button>
                        )}

                        {step === 'config' && (
                            <button
                                onClick={handleRestore}
                                disabled={!canStartRestore(windows?'/managed-recovery':restorePath, fileSelectionMode, selectedFiles)}
                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                            >
                                <RotateCcw size={16} /> Start Restore
                            </button>
                        )}

                        {step === 'result' && (
                            <button onClick={onClose} className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold text-sm">
                                Close
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
