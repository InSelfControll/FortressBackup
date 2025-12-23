import React, { useState, useEffect } from 'react';
import { X, Clock, Server, FolderInput, CheckCircle2, AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import { BackupJob, System, Snapshot } from '../types';

interface RestoreModalProps {
    job: BackupJob;
    systems: System[];
    isOpen: boolean;
    onClose: () => void;
}

export const RestoreModal: React.FC<RestoreModalProps> = ({ job, systems, isOpen, onClose }) => {
    const [step, setStep] = useState<'snapshots' | 'config' | 'restoring' | 'result'>('snapshots');
    const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);
    const [restoreToOriginal, setRestoreToOriginal] = useState(false);
    const [fileSelectionMode, setFileSelectionMode] = useState<'all' | 'specific'>('all');
    const [files, setFiles] = useState<any[]>([]);
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
    const [filesLoaded, setFilesLoaded] = useState(false);

    const [restorePath, setRestorePath] = useState('');
    const [targetSystemId, setTargetSystemId] = useState('');
    const [restoreLogs, setRestoreLogs] = useState<string[]>([]);
    const [restoreSuccess, setRestoreSuccess] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchSnapshots();
            setRestorePath('');
            setTargetSystemId(job.sourceId);
            setStep('snapshots');
            setError(null);
            setRestoreLogs([]);
            setRestoreToOriginal(false);
            setFileSelectionMode('all');
            setFiles([]);
            setSelectedFiles([]);
            setFilesLoaded(false);
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
        setSelectedSnapshot(snap);
        setStep('config');
        setRestorePath(`/tmp/restore_${snap.shortId}`);
        // Reset file selection state
        setFileSelectionMode('all');
        setFilesLoaded(false);
        setFiles([]);
        setSelectedFiles([]);
    };

    const toggleFileSelection = (path: string) => {
        setSelectedFiles(prev =>
            prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
        );
    };

    const handleRestore = async () => {
        if (!selectedSnapshot) return;

        // precise path logic: if original, use root. If custom, use input.
        const effectivePath = restoreToOriginal ? '/' : restorePath;
        if (!effectivePath) return;

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

            const payload: any = {
                snapshotId: selectedSnapshot.id,
                restorePath: effectivePath,
                systemId: targetSystemId
            };

            if (fileSelectionMode === 'specific' && selectedFiles.length > 0) {
                payload.paths = selectedFiles;
            }

            const res = await fetch(`/api/jobs/${job.id}/restore`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const text = await res.text();
                try {
                    const errJson = JSON.parse(text);
                    throw new Error(errJson.error || 'Restore failed');
                } catch (e) {
                    throw new Error(`Restore failed: ${res.status} ${text.substring(0, 100)}`);
                }
            }

            const data = await res.json();

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
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${step === 'result' ? (restoreSuccess ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400') : 'bg-indigo-500/10 text-indigo-400'}`}>
                            <RotateCcw size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Restore Backup</h3>
                            <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">{job.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {step === 'snapshots' && (
                        <div className="space-y-4">
                            <h4 className="text-sm font-medium text-slate-400 uppercase tracking-widest">Select a Snapshot</h4>
                            {loading ? (
                                <div className="flex items-center justify-center py-12 text-slate-500 gap-2">
                                    <Loader2 className="animate-spin" size={20} /> Loading snapshots...
                                </div>
                            ) : error ? (
                                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm flex gap-3 items-center">
                                    <AlertTriangle size={20} /> {error}
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
                                                {systems.map(sys => (
                                                    <option key={sys.id} value={sys.id}>{sys.name} ({sys.host})</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Restore Location</span>
                                            <button
                                                onClick={() => setRestoreToOriginal(!restoreToOriginal)}
                                                className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${restoreToOriginal ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}
                                            >
                                                {restoreToOriginal ? 'Using Original Path' : 'Use Original Path'}
                                            </button>
                                        </label>

                                        {restoreToOriginal ? (
                                            <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-400 text-sm italic flex items-center gap-2">
                                                <RotateCcw size={14} /> Will restore files to their original paths
                                            </div>
                                        ) : (
                                            <div className="relative">
                                                <FolderInput className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                                <input
                                                    type="text"
                                                    value={restorePath}
                                                    onChange={e => setRestorePath(e.target.value)}
                                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                                                    placeholder="/tmp/restored_files"
                                                />
                                            </div>
                                        )}
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
                                        <div className="bg-slate-950 border border-slate-800 rounded-lg h-48 overflow-hidden flex flex-col">
                                            {loadingFiles ? (
                                                <div className="flex items-center justify-center h-full text-slate-500 gap-2">
                                                    <Loader2 className="animate-spin" size={16} /> Loading file list...
                                                </div>
                                            ) : (
                                                <div className="overflow-y-auto p-2 space-y-1">
                                                    {files.map((file, idx) => (
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
                                                    {files.length === 0 && (
                                                        <div className="text-center py-8 text-xs text-slate-600">No files found listing</div>
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
                <div className="p-4 border-t border-slate-800 flex justify-between items-center bg-slate-800/30">
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
                                disabled={!restorePath}
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
