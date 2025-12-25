import React, { useState, useEffect } from 'react';
import { System, SSHKey } from '../../types';
import { ShieldCheck, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface DeploymentTerminalProps {
    system: System;
    sshKeys: SSHKey[];
    onClose: () => void;
    onComplete: (installedTools: string[]) => void;
}

export const DeploymentTerminal = ({ system, sshKeys, onClose, onComplete }: DeploymentTerminalProps) => {
    const [logs, setLogs] = useState<{ type: string; message: string; timestamp: Date }[]>([]);
    const [status, setStatus] = useState<'credentials' | 'deploying' | 'completed' | 'failed'>('credentials');
    const [selectedKeyId, setSelectedKeyId] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [authMethod, setAuthMethod] = useState<'key' | 'password'>('key');
    const [error, setError] = useState<string | null>(null);
    const [selectedTools, setSelectedTools] = useState<string[]>([]);

    const AVAILABLE_TOOLS = [
        { id: 'borg', name: 'BorgBackup', description: 'Deduplicating backup' },
        { id: 'restic', name: 'Restic', description: 'Cloud-ready backup' },
        { id: 'rsync', name: 'Rsync', description: 'Simple file sync' },
        { id: 'rclone', name: 'Rclone', description: 'Cloud storage sync' }
    ];

    const addLog = (type: string, message: string) => {
        setLogs(prev => [...prev, { type, message, timestamp: new Date() }]);
    };

    const toggleTool = (toolId: string) => {
        setSelectedTools(prev =>
            prev.includes(toolId)
                ? prev.filter(t => t !== toolId)
                : [...prev, toolId]
        );
    };

    useEffect(() => {
        // Fetch selected tools from config
        const token = localStorage.getItem('fortress_token');
        fetch('http://localhost:9001/api/config/selected_tools', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (data.value && Array.isArray(data.value)) {
                    setSelectedTools(data.value.map((t: string) => t.toLowerCase()));
                } else {
                    setSelectedTools(['borg']); // Default to borg
                }
            })
            .catch(() => {
                setSelectedTools(['borg']); // Default to borg on error
            });

        // If the system already has an assigned SSH key, auto-select it
        if (system.sshKeyId) {
            setSelectedKeyId(system.sshKeyId);
            addLog('info', 'System has assigned SSH identity. Ready to deploy.');
        }
    }, []);

    const startDeployment = async () => {
        setStatus('deploying');
        setError(null);
        addLog('info', `Starting deployment to ${system.name}...`);
        addLog('info', `Tools to install: ${selectedTools.join(', ')}`);

        try {
            // Call backend API
            const response = await fetch(`http://localhost:9001/api/systems/${system.id}/deploy`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('fortress_token')}`
                },
                body: JSON.stringify({
                    sshKeyId: authMethod === 'key' ? selectedKeyId : undefined,
                    password: authMethod === 'password' ? password : undefined,
                    tools: selectedTools
                })
            });

            const result = await response.json();

            if (result.logs) {
                result.logs.forEach((log: { type: string; message: string }) => {
                    addLog(log.type, log.message);
                });
            }

            if (result.success) {
                setStatus('completed');
                addLog('success', 'Deployment completed successfully!');
                onComplete(result.installedTools || []);
            } else {
                setStatus('failed');
                setError(result.error || 'Deployment failed');
                addLog('error', result.error || 'Deployment failed');
            }
        } catch (err: any) {
            setStatus('failed');
            setError(err.message);
            addLog('error', `Deployment failed: ${err.message}`);
        }
    };

    const getLogColor = (type: string) => {
        switch (type) {
            case 'ssh': return 'text-indigo-400';
            case 'success': return 'text-emerald-400';
            case 'error': return 'text-rose-400';
            case 'progress': return 'text-slate-500 italic';
            case 'cmd': return 'text-amber-400';
            default: return 'text-slate-300';
        }
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[100] p-6">
            <div className="w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col h-[70vh]">
                <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-rose-500" />
                        <div className="w-3 h-3 rounded-full bg-amber-500" />
                        <div className="w-3 h-3 rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-black uppercase text-slate-500 ml-4 tracking-widest">Engine Deployment: {system.name}</span>
                    </div>
                    {(status === 'completed' || status === 'failed') && (
                        <button onClick={onClose} className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${status === 'completed' ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>Close Terminal</button>
                    )}
                </div>

                {status === 'credentials' ? (
                    <div className="flex-1 p-8 space-y-6">
                        <div>
                            <h3 className="text-xl font-black text-white mb-2">SSH Authentication</h3>
                            <p className="text-slate-500 text-sm">Provide credentials to connect to {system.host}</p>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setAuthMethod('key')}
                                className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${authMethod === 'key' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                            >
                                SSH Key
                            </button>
                            <button
                                onClick={() => setAuthMethod('password')}
                                className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${authMethod === 'password' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                            >
                                Password
                            </button>
                        </div>

                        {authMethod === 'key' ? (
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Select SSH Key</label>
                                <select
                                    value={selectedKeyId}
                                    onChange={e => setSelectedKeyId(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">Select an SSH key...</option>
                                    {sshKeys.map(key => (
                                        <option key={key.id} value={key.id}>{key.name}</option>
                                    ))}
                                </select>
                                {sshKeys.length === 0 && (
                                    <p className="text-rose-400 text-xs ml-2">No SSH keys available. Add one in the Identity Vault.</p>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">SSH Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Enter password for remote server"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        )}

                        {/* Tool Selection */}
                        <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Select Tools to Install</label>
                            <div className="grid grid-cols-2 gap-3">
                                {AVAILABLE_TOOLS.map(tool => (
                                    <div
                                        key={tool.id}
                                        onClick={() => toggleTool(tool.id)}
                                        className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedTools.includes(tool.id) ? 'bg-indigo-600/10 border-indigo-500' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${selectedTools.includes(tool.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-500'}`}>
                                                {selectedTools.includes(tool.id) && <span className="text-white text-[10px]">✓</span>}
                                            </div>
                                            <span className="text-sm font-bold text-white">{tool.name}</span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-1 ml-6">{tool.description}</p>
                                    </div>
                                ))}
                            </div>
                            {selectedTools.length === 0 && (
                                <p className="text-rose-400 text-xs ml-2">Select at least one tool to install.</p>
                            )}
                        </div>

                        {error && (
                            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-rose-400 text-sm">
                                {error}
                            </div>
                        )}

                        <div className="flex gap-4 pt-4">
                            <button onClick={onClose} className="px-6 py-3 text-slate-500 hover:text-white font-bold uppercase text-xs">
                                Cancel
                            </button>
                            <button
                                onClick={startDeployment}
                                disabled={selectedTools.length === 0 || (authMethod === 'key' && !selectedKeyId) || (authMethod === 'password' && !password)}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-all"
                            >
                                Start Deployment
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-6 font-mono text-xs space-y-2 bg-black/40">
                        {logs.map((log, i) => (
                            <div key={i} className={getLogColor(log.type)}>
                                <span className="text-slate-700 mr-2 opacity-50">[{log.timestamp.toLocaleTimeString([], { hour12: false })}]</span>
                                [{log.type.toUpperCase()}] {log.message}
                            </div>
                        ))}
                        {status === 'deploying' && <div className="text-indigo-400 animate-pulse">_</div>}
                        {status === 'completed' && (
                            <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 font-bold flex items-center gap-3 animate-in fade-in zoom-in-95">
                                <ShieldCheck size={20} /> Orchestration engines deployed successfully.
                            </div>
                        )}
                        {status === 'failed' && (
                            <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 font-bold flex items-center gap-3">
                                <AlertCircle size={20} /> Deployment failed. Check the logs above.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
