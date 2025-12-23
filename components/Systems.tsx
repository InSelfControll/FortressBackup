import React, { useState, useRef, useEffect } from 'react';
import { System, BackupJob, SSHKey, BackupTool } from '../types';
import { createSSHKey } from '../services/api/index.js';
import {
  Server, Plus, Terminal, Laptop, X, ShieldCheck,
  Key, Trash2, Upload, Box, DownloadCloud, Edit3, AlertCircle, Shield
} from 'lucide-react';

interface SystemsProps {
  systems: System[];
  jobs: BackupJob[];
  onAddSystem: (s: System) => void;
  onDeleteSystem?: (id: string) => void;
  sshKeys: SSHKey[];
  onAddSSHKey: (key: SSHKey) => void;
  onDeleteSSHKey: (id: string) => void;
  onUpdateSystem: (sys: System) => void;
}

interface DeploymentTerminalProps {
  system: System;
  sshKeys: SSHKey[];
  onClose: () => void;
  onComplete: (installedTools: string[]) => void;
}

const DeploymentTerminal = ({ system, sshKeys, onClose, onComplete }: DeploymentTerminalProps) => {
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

export const Systems: React.FC<SystemsProps> = ({ systems, jobs, onAddSystem, onDeleteSystem, sshKeys, onAddSSHKey, onDeleteSSHKey, onUpdateSystem }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSystem, setEditingSystem] = useState<System | null>(null);
  const [isKeyManagerOpen, setIsKeyManagerOpen] = useState(false);
  const [deployingSystem, setDeployingSystem] = useState<System | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isAddingKey, setIsAddingKey] = useState(false);

  const [newKey, setNewKey] = useState({
    name: '',
    privateKey: '',
    passphrase: ''
  });

  const [newSystem, setNewSystem] = useState<Partial<System> & { sshKeyId?: string }>({
    name: '', host: '', type: 'remote', port: 22, username: 'root', sshKeyId: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDeploy = (system: System) => {
    setDeployingSystem(system);
  };

  const finalizeDeployment = (system: System, installedTools: string[]) => {
    const toolMap: Record<string, BackupTool> = {
      'borg': BackupTool.BORG,
      'restic': BackupTool.RESTIC,
      'rsync': BackupTool.RSYNC,
      'rclone': BackupTool.RCLONE
    };
    const tools = installedTools.map(t => toolMap[t.toLowerCase()] || BackupTool.BORG);
    onUpdateSystem({
      ...system,
      installedTools: tools
    });
  };

  const handleAddSSHKey = async () => {
    if (!newKey.name || !newKey.privateKey) return;

    setIsAddingKey(true);
    try {
      const result = await createSSHKey(newKey.name, newKey.privateKey, newKey.passphrase);
      if (result.data?.id) {
        onAddSSHKey({
          id: result.data.id,
          name: newKey.name,
          isEncrypted: true,
          createdAt: new Date().toLocaleDateString(),
          order: sshKeys.length,
          privateKeyPath: 'stored-on-server' // placeholder
        });
        setNewKey({ name: '', privateKey: '', passphrase: '' });
      }
    } catch (e) {
      console.error("Failed to add key", e);
    } finally {
      setIsAddingKey(false);
    }
  };

  const handleAddSystem = () => {
    if (newSystem.name && newSystem.host) {
      onAddSystem({
        ...newSystem,
        id: crypto.randomUUID(),
        status: 'online',
        lastSeen: 'Now',
        health: 100,
        installedTools: []
      } as System);
      setIsModalOpen(false);
      setNewSystem({ name: '', host: '', type: 'remote', port: 22, username: 'root' });
    }
  };

  const handleEditSystem = (system: System) => {
    setEditingSystem(system);
    setNewSystem({
      name: system.name,
      host: system.host,
      type: system.type,
      port: system.port || 22,
      username: system.username || 'root',
      sshKeyId: system.sshKeyId || ''
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateSystem = () => {
    if (editingSystem && newSystem.name && newSystem.host) {
      onUpdateSystem({
        ...editingSystem,
        name: newSystem.name,
        host: newSystem.host,
        type: newSystem.type as 'local' | 'remote',
        port: newSystem.port,
        username: newSystem.username,
        sshKeyId: newSystem.sshKeyId
      });
    }
    setIsEditModalOpen(false);
    setEditingSystem(null);
    setNewSystem({ name: '', host: '', type: 'remote', port: 22, username: 'root' });
  };

  const handleDeleteSystem = (id: string) => {
    if (onDeleteSystem) {
      onDeleteSystem(id);
    }
    setDeleteConfirm(null);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">System Infrastructure</h2>
          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">Managed Nodes Cluster</p>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setIsKeyManagerOpen(true)} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-6 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 shadow-sm">
            <Key size={18} /> Identity Vault ({sshKeys.length})
          </button>
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-black text-sm shadow-lg shadow-indigo-500/20 transition-all active:scale-95">
            <Plus size={18} /> Register Node
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {systems.length === 0 && (
          <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-800 rounded-[2rem] bg-slate-800/20">
            <Server size={48} className="mx-auto text-slate-700 mb-4" />
            <h3 className="text-lg font-bold text-slate-400">No Systems Registered</h3>
            <p className="text-slate-500 text-sm mt-2">Add your first managed node to begin orchestration.</p>
          </div>
        )}
        {systems.map((system) => (
          <div key={system.id} className="bg-slate-800/40 border border-slate-700/50 rounded-[2rem] p-8 hover:border-indigo-500/40 transition-all group hover:bg-slate-800/60 shadow-xl relative overflow-hidden flex flex-col min-h-[300px]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full -translate-y-16 translate-x-16 group-hover:scale-150 transition-transform duration-1000" />

            <div className="flex justify-between items-start mb-6 relative z-10">
              <div className="p-4 bg-slate-700/30 rounded-2xl text-indigo-400 group-hover:bg-indigo-600/10 group-hover:scale-110 transition-all shadow-inner border border-slate-600/20">
                {system.type === 'remote' ? <Server size={32} /> : <Laptop size={32} />}
              </div>
              <div className="flex items-center gap-2">
                <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all shadow-sm ${system.status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                  {system.status}
                </div>
              </div>
            </div>

            <div className="relative z-10 mb-8 flex-1">
              <h3 className="text-2xl font-black text-slate-100 tracking-tight mb-1.5">{system.name}</h3>
              <p className="text-xs text-slate-500 font-mono flex items-center gap-2 bg-slate-900/50 w-fit px-3 py-1.5 rounded-xl border border-slate-700/30">
                <Terminal size={14} className="text-indigo-500/60" /> {system.username}@{system.host}
              </p>
            </div>

            <div className="relative z-10 space-y-4">
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Active Engines</span>
                  <div className="flex gap-2">
                    {system.installedTools?.map(t => (
                      <div key={t} className="w-6 h-6 rounded-md bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400" title={t}>
                        <Box size={14} />
                      </div>
                    ))}
                    {(!system.installedTools || system.installedTools.length === 0) && <span className="text-[10px] text-slate-700 font-bold uppercase italic">None Deployed</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEditSystem(system); }}
                    className="p-2 bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
                    title="Edit System"
                  >
                    <Edit3 size={14} />
                  </button>
                  {deleteConfirm === system.id ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteSystem(system.id); }}
                      className="p-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition-all text-[10px] font-bold"
                    >
                      Confirm
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(system.id); }}
                      className="p-2 bg-slate-700/50 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-xl transition-all"
                      title="Delete System"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeploy(system); }}
                    className="flex items-center gap-2 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-500/20 transition-all active:scale-95"
                  >
                    <DownloadCloud size={14} /> {system.installedTools && system.installedTools.length > 0 ? 'Re-Deploy' : 'Deploy Toolset'}
                  </button>
                </div>
              </div>
              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-700/50">
                <div className={`h-full transition-all duration-1000 ${system.health > 80 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${system.health}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {deployingSystem && (
        <DeploymentTerminal
          system={deployingSystem}
          sshKeys={sshKeys}
          onClose={() => setDeployingSystem(null)}
          onComplete={(installedTools) => finalizeDeployment(deployingSystem, installedTools)}
        />
      )}

      {/* Add System Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-[2.5rem] w-full max-w-xl p-8 animate-in slide-in-from-bottom-8 duration-500">
            <h3 className="text-2xl font-black text-white mb-6">Register Managed Node</h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Node Name</label>
                <input type="text" value={newSystem.name} onChange={e => setNewSystem({ ...newSystem, name: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Web Server Alpha" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Hostname / IP</label>
                  <input type="text" value={newSystem.host} onChange={e => setNewSystem({ ...newSystem, host: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="10.0.0.5" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-2">SSH Port</label>
                  <input type="number" value={newSystem.port} onChange={e => setNewSystem({ ...newSystem, port: parseInt(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="22" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Default User</label>
                <input type="text" value={newSystem.username} onChange={e => setNewSystem({ ...newSystem, username: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="root" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">SSH Identity (Optional)</label>
                <select
                  value={newSystem.sshKeyId || ''}
                  onChange={e => setNewSystem({ ...newSystem, sshKeyId: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
                >
                  <option value="">No SSH Key (Password Only)</option>
                  {sshKeys.map(key => (
                    <option key={key.id} value={key.id}>{key.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-4 mt-10">
              <button onClick={() => setIsModalOpen(false)} className="px-6 py-4 text-slate-500 hover:text-white font-black uppercase text-[10px]">Cancel</button>
              <button onClick={handleAddSystem} className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-600/20 transition-all">Enroll System</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit System Modal */}
      {isEditModalOpen && editingSystem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-[2.5rem] w-full max-w-xl p-8 animate-in slide-in-from-bottom-8 duration-500">
            <h3 className="text-2xl font-black text-white mb-6">Edit System</h3>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Node Name</label>
                <input type="text" value={newSystem.name} onChange={e => setNewSystem({ ...newSystem, name: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Hostname / IP</label>
                  <input type="text" value={newSystem.host} onChange={e => setNewSystem({ ...newSystem, host: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-2">SSH Port</label>
                  <input type="number" value={newSystem.port} onChange={e => setNewSystem({ ...newSystem, port: parseInt(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Default User</label>
                <input type="text" value={newSystem.username} onChange={e => setNewSystem({ ...newSystem, username: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">SSH Identity (Optional)</label>
                <select
                  value={newSystem.sshKeyId || ''}
                  onChange={e => setNewSystem({ ...newSystem, sshKeyId: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
                >
                  <option value="">No SSH Key (Password Only)</option>
                  {sshKeys.map(key => (
                    <option key={key.id} value={key.id}>{key.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-4 mt-10">
              <button onClick={() => { setIsEditModalOpen(false); setEditingSystem(null); }} className="px-6 py-4 text-slate-500 hover:text-white font-black uppercase text-[10px]">Cancel</button>
              <button onClick={handleUpdateSystem} className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-600/20 transition-all">Update System</button>
            </div>
          </div>
        </div>
      )}

      {/* Key Manager Modal */}
      {isKeyManagerOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-[2.5rem] w-full max-w-6xl shadow-2xl h-[92vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
            <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <div className="p-3.5 rounded-[1.25rem] border shadow-inner transition-colors bg-indigo-600/10 border-indigo-500/20">
                  <ShieldCheck className="text-indigo-400" size={32} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white tracking-tight">Identity Vault</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-indigo-500 uppercase tracking-[0.2em] font-black flex items-center gap-1">Server-Side Encrypted • {sshKeys.length} Keys</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setIsKeyManagerOpen(false)} className="p-3 text-slate-500 hover:text-white transition-colors hover:bg-slate-800 rounded-2xl border border-transparent hover:border-slate-700"><X size={28} /></button>
            </div>

            <div className="p-10 flex-1 overflow-y-auto space-y-12">
              {/* SSH Keys List */}
              {sshKeys.length > 0 && (
                <div className="bg-slate-800/30 p-8 rounded-[3rem] border border-slate-700/50 shadow-inner">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase mb-6 tracking-[0.3em]">Stored Identities</h4>
                  <div className="space-y-4">
                    {sshKeys.map(key => (
                      <div key={key.id} className="flex items-center justify-between p-4 bg-slate-900/50 rounded-2xl border border-slate-700/30">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-indigo-500/10 rounded-xl">
                            <Key className="text-indigo-400" size={20} />
                          </div>
                          <div>
                            <h5 className="text-sm font-bold text-white">{key.name}</h5>
                            <div className="flex items-center gap-4 mt-1">
                              <span className="text-[10px] text-slate-500 font-bold uppercase">Created: {key.createdAt || 'Unknown'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {key.isEncrypted && (
                            <span className="text-[10px] text-emerald-400 font-bold uppercase bg-emerald-500/10 px-2 py-1 rounded">Encrypted</span>
                          )}
                          <button
                            onClick={() => onDeleteSSHKey(key.id)}
                            className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add New Key */}
              <div className="bg-slate-800/30 p-10 rounded-[3rem] border border-slate-700/50 shadow-inner">
                <h4 className="text-[10px] font-black text-slate-500 uppercase mb-8 tracking-[0.3em]">Import New Identity</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Alias</label>
                    <input type="text" value={newKey.name} onChange={e => setNewKey({ ...newKey, name: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Production Master Key" />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Private Key Data</label>
                    <div className="relative">
                      <textarea value={newKey.privateKey} onChange={e => setNewKey({ ...newKey, privateKey: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-mono text-sm outline-none focus:ring-2 focus:ring-indigo-500 h-32" placeholder="-----BEGIN OPENSSH..." />
                      <button onClick={() => fileInputRef.current?.click()} className="absolute right-3 top-3 p-2 bg-slate-800 rounded-xl text-indigo-400"><Upload size={18} /></button>
                      <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          const r = new FileReader();
                          r.onload = ev => setNewKey({ ...newKey, privateKey: ev.target?.result as string });
                          r.readAsText(f);
                        }
                      }} />
                    </div>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Passphrase (Optional)</label>
                    <input type="password" value={newKey.passphrase} onChange={e => setNewKey({ ...newKey, passphrase: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="••••••••" />
                  </div>
                </div>
                <button onClick={handleAddSSHKey} disabled={!newKey.name || !newKey.privateKey || isAddingKey} className="w-full mt-8 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 active:scale-[0.98] transition-all disabled:opacity-50">
                  {isAddingKey ? 'Encrypting & Storing...' : 'Securely Store Identity'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
