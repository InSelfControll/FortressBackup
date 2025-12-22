
import React, { useState, useEffect, useRef } from 'react';
import { System, BackupJob, JobStatus, SSHKey, EncryptedData, BackupTool } from '../types';
import * as Encryption from '../services/encryptionService';
import { 
  Server, Plus, Terminal, Laptop, X, Activity, Shield, 
  Clock, CheckCircle2, Key, Trash2, Save, Wifi, Loader2, Check, User, Upload, GripVertical, AlertCircle, Eye, EyeOff, Calendar, ChevronDown, Lock, Unlock, ShieldAlert, ShieldCheck, RefreshCw, Box, DownloadCloud
} from 'lucide-react';

interface SystemsProps {
  systems: System[];
  jobs: BackupJob[];
  onAddSystem: (s: System) => void;
  sshKeys: SSHKey[];
  onAddSSHKey: (key: SSHKey) => void;
  onDeleteSSHKey: (id: string) => void;
  onUpdateSystem: (sys: System) => void;
}

const DeploymentTerminal = ({ system, onClose, onComplete }: { system: System; onClose: () => void; onComplete: () => void }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<'deploying' | 'completed' | 'failed'>('deploying');

  useEffect(() => {
    const sequence = [
      `[SSH] Attempting connection to ${system.username}@${system.host}:${system.port || 22}...`,
      `[SSH] Authenticating with Vault Identity... SUCCESS.`,
      `[OS] Detecting distribution... Ubuntu 22.04.3 LTS`,
      `[REPO] Updating package index... sudo apt-get update -y`,
      `[DEP] Found: python3, liblz4-1, libssl-dev`,
      `[INSTALL] Installing borgbackup via apt...`,
      `[PROGRESS] Selecting previously unselected package borgbackup.`,
      `[PROGRESS] Preparing to unpack .../borgbackup_1.2.0-1_amd64.deb ...`,
      `[PROGRESS] Unpacking borgbackup (1.2.0-1) ...`,
      `[RESTIC] Downloading restic_0.16.0_linux_amd64.bz2 from GitHub...`,
      `[RESTIC] Unpacking binary to /usr/local/bin/restic...`,
      `[CHMOD] Setting execution bits...`,
      `[VERIFY] borg version 1.2.0`,
      `[VERIFY] restic 0.16.0 (built 2023-08-07)`,
      `[ORCH] Deployment finalized. Core engines are active.`
    ];

    let i = 0;
    const interval = setInterval(() => {
      if (i < sequence.length) {
        setLogs(prev => [...prev, sequence[i]]);
        i++;
      } else {
        setStatus('completed');
        clearInterval(interval);
        onComplete(); // Persistence callback
      }
    }, 300);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[100] p-6">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col h-[70vh]">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
           <div className="flex items-center gap-3">
             <div className="w-3 h-3 rounded-full bg-rose-500"/>
             <div className="w-3 h-3 rounded-full bg-amber-500"/>
             <div className="w-3 h-3 rounded-full bg-emerald-500"/>
             <span className="text-[10px] font-black uppercase text-slate-500 ml-4 tracking-widest">Engine Deployment: {system.name}</span>
           </div>
           {status === 'completed' && (
             <button onClick={onClose} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all">Close Terminal</button>
           )}
        </div>
        <div className="flex-1 overflow-y-auto p-6 font-mono text-xs space-y-2 bg-black/40">
           {logs.map((log, i) => (
             <div key={i} className={`${log.includes('[SSH]') ? 'text-indigo-400' : log.includes('[PROGRESS]') ? 'text-slate-500 italic' : 'text-slate-300'}`}>
               <span className="text-slate-700 mr-2 opacity-50">[{new Date().toLocaleTimeString([], {hour12: false})}]</span> {log}
             </div>
           ))}
           {status === 'deploying' && <div className="text-indigo-400 animate-pulse">_</div>}
           {status === 'completed' && (
             <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 font-bold flex items-center gap-3 animate-in fade-in zoom-in-95">
                <ShieldCheck size={20}/> Orchestration engines deployed successfully.
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export const Systems: React.FC<SystemsProps> = ({ systems, jobs, onAddSystem, sshKeys, onAddSSHKey, onDeleteSSHKey, onUpdateSystem }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isKeyManagerOpen, setIsKeyManagerOpen] = useState(false);
  const [deployingSystem, setDeployingSystem] = useState<System | null>(null);
  
  // Vault States
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [masterPassword, setMasterPassword] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [decryptedKeyMap, setDecryptedKeyMap] = useState<Record<string, { path: string; passphrase?: string }>>({});

  const [newKey, setNewKey] = useState<Partial<SSHKey>>({ 
    name: '', 
    privateKeyPath: '', 
    expiryDate: '', 
    passphrase: '' 
  });
  
  const [newSystem, setNewSystem] = useState<Partial<System>>({ 
    name: '', host: '', type: 'remote', port: 22, username: 'root' 
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUnlockVault = async () => {
    if (!masterPassword) return;
    setIsUnlocking(true);
    setUnlockError(null);
    try {
      const saltStr = localStorage.getItem('fortress_vault_salt');
      if (!saltStr) throw new Error("Vault not initialized.");
      const salt = Encryption.base64ToBuffer(saltStr);
      const key = await Encryption.deriveKey(masterPassword, salt);
      setVaultKey(key);
      setMasterPassword('');
      const newMap: Record<string, { path: string; passphrase?: string }> = {};
      for (const k of sshKeys) {
        if (k.isEncrypted) {
          const pathData = k.privateKeyPath as EncryptedData;
          const path = await Encryption.decrypt(pathData.ciphertext, pathData.iv, key);
          let passphrase = '';
          if (k.passphrase) {
            const passData = k.passphrase as EncryptedData;
            passphrase = await Encryption.decrypt(passData.ciphertext, passData.iv, key);
          }
          newMap[k.id] = { path, passphrase };
        }
      }
      setDecryptedKeyMap(newMap);
    } catch (e) {
      setUnlockError('Access Denied. Check Master Password.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleDeploy = (system: System) => {
    setDeployingSystem(system);
  };

  const finalizeDeployment = (system: System) => {
    // Add tools to system after terminal finishes
    onUpdateSystem({
        ...system,
        installedTools: [BackupTool.BORG, BackupTool.RESTIC]
    });
  };

  const handleAddSSHKey = async () => {
    if (newKey.name && newKey.privateKeyPath && vaultKey) {
      const encryptedPath = await Encryption.encrypt(newKey.privateKeyPath as string, vaultKey);
      let encryptedPassphrase;
      if (newKey.passphrase) {
        encryptedPassphrase = await Encryption.encrypt(newKey.passphrase as string, vaultKey);
      }
      const id = crypto.randomUUID();
      onAddSSHKey({
        ...newKey,
        id,
        privateKeyPath: encryptedPath,
        passphrase: encryptedPassphrase,
        isEncrypted: true,
        createdAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        order: sshKeys.length
      } as SSHKey);
      setDecryptedKeyMap(prev => ({ ...prev, [id]: { path: newKey.privateKeyPath as string, passphrase: newKey.passphrase as string } }));
      setNewKey({ name: '', privateKeyPath: '', expiryDate: '', passphrase: '' });
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

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">System Infrastructure</h2>
          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">Managed Nodes Cluster</p>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setIsKeyManagerOpen(true)} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-6 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 shadow-sm">
            <Key size={18} /> Identity Vault
          </button>
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-black text-sm shadow-lg shadow-indigo-500/20 transition-all active:scale-95">
            <Plus size={18} /> Register Node
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {systems.map((system) => (
          <div key={system.id} className="bg-slate-800/40 border border-slate-700/50 rounded-[2rem] p-8 hover:border-indigo-500/40 transition-all cursor-pointer group hover:bg-slate-800/60 shadow-xl relative overflow-hidden flex flex-col min-h-[300px]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full -translate-y-16 translate-x-16 group-hover:scale-150 transition-transform duration-1000" />
            
            <div className="flex justify-between items-start mb-6 relative z-10">
              <div className="p-4 bg-slate-700/30 rounded-2xl text-indigo-400 group-hover:bg-indigo-600/10 group-hover:scale-110 transition-all shadow-inner border border-slate-600/20">
                {system.type === 'remote' ? <Server size={32} /> : <Laptop size={32} />}
              </div>
              <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all shadow-sm ${system.status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                {system.status}
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
                            <Box size={14}/>
                         </div>
                       ))}
                       {(!system.installedTools || system.installedTools.length === 0) && <span className="text-[10px] text-slate-700 font-bold uppercase italic">None Deployed</span>}
                    </div>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeploy(system); }} 
                    className="flex items-center gap-2 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-500/20 transition-all active:scale-95"
                  >
                    <DownloadCloud size={14}/> {system.installedTools && system.installedTools.length > 0 ? 'Re-Deploy' : 'Deploy Toolset'}
                  </button>
               </div>
               <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-700/50">
                  <div className={`h-full transition-all duration-1000 ${system.health > 80 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{width: `${system.health}%`}}/>
               </div>
            </div>
          </div>
        ))}
      </div>

      {deployingSystem && <DeploymentTerminal system={deployingSystem} onClose={() => setDeployingSystem(null)} onComplete={() => finalizeDeployment(deployingSystem)} />}

      {isModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center z-50 p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-[2.5rem] w-full max-w-xl p-8 animate-in slide-in-from-bottom-8 duration-500">
                  <h3 className="text-2xl font-black text-white mb-6">Register Managed Node</h3>
                  <div className="space-y-4">
                      <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Node Name</label>
                          <input type="text" value={newSystem.name} onChange={e => setNewSystem({...newSystem, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Web Server Alpha"/>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Hostname / IP</label>
                              <input type="text" value={newSystem.host} onChange={e => setNewSystem({...newSystem, host: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="10.0.0.5"/>
                          </div>
                          <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase text-slate-500 ml-2">SSH Port</label>
                              <input type="number" value={newSystem.port} onChange={e => setNewSystem({...newSystem, port: parseInt(e.target.value)})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="22"/>
                          </div>
                      </div>
                      <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Default User</label>
                          <input type="text" value={newSystem.username} onChange={e => setNewSystem({...newSystem, username: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="root"/>
                      </div>
                  </div>
                  <div className="flex justify-end gap-4 mt-10">
                      <button onClick={() => setIsModalOpen(false)} className="px-6 py-4 text-slate-500 hover:text-white font-black uppercase text-[10px]">Cancel</button>
                      <button onClick={handleAddSystem} className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-600/20 transition-all">Enroll System</button>
                  </div>
              </div>
          </div>
      )}

      {isKeyManagerOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center z-50 p-4">
           <div className="bg-slate-900 border border-slate-700 rounded-[2.5rem] w-full max-w-6xl shadow-2xl h-[92vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
              <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
                 <div className="flex items-center gap-4">
                   <div className={`p-3.5 rounded-[1.25rem] border shadow-inner transition-colors ${vaultKey ? 'bg-emerald-600/10 border-emerald-500/20' : 'bg-rose-600/10 border-rose-500/20'}`}>
                     {vaultKey ? <ShieldCheck className="text-emerald-400" size={32}/> : <ShieldAlert className="text-rose-400" size={32}/>}
                   </div>
                   <div>
                     <h3 className="text-2xl font-black text-white tracking-tight">Cryptographic Key Vault</h3>
                     <div className="flex items-center gap-2">
                        {vaultKey ? (
                          <span className="text-[10px] text-emerald-500 uppercase tracking-[0.2em] font-black flex items-center gap-1"><Unlock size={10}/> Session Active</span>
                        ) : (
                          <span className="text-[10px] text-rose-500 uppercase tracking-[0.2em] font-black flex items-center gap-1"><Lock size={10}/> Vault Sealed</span>
                        )}
                     </div>
                   </div>
                 </div>
                 <button onClick={() => setIsKeyManagerOpen(false)} className="p-3 text-slate-500 hover:text-white transition-colors hover:bg-slate-800 rounded-2xl border border-transparent hover:border-slate-700"><X size={28}/></button>
              </div>
              
              {!vaultKey ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8">
                  <div className="max-w-md w-full bg-slate-800/40 p-10 rounded-[2.5rem] border border-slate-700 text-center shadow-2xl">
                    <Lock size={40} className="text-indigo-400 mx-auto mb-6 animate-pulse" />
                    <h4 className="text-2xl font-black text-white mb-8">Unlock Session</h4>
                    <input 
                      type="password" 
                      value={masterPassword} 
                      onChange={e => setMasterPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleUnlockVault()}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white text-center font-bold tracking-[0.3em] outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Master Secret"
                    />
                    <button 
                      onClick={handleUnlockVault}
                      disabled={isUnlocking || !masterPassword}
                      className="w-full mt-6 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-widest transition-all disabled:opacity-50"
                    >
                      {isUnlocking ? 'Deriving Key...' : 'Unlock Identity Vault'}
                    </button>
                    {unlockError && <p className="mt-4 text-rose-400 text-xs font-black uppercase tracking-widest">{unlockError}</p>}
                  </div>
                </div>
              ) : (
                <div className="p-10 flex-1 overflow-y-auto space-y-12">
                   <div className="bg-slate-800/30 p-10 rounded-[3rem] border border-slate-700/50 shadow-inner">
                      <h4 className="text-[10px] font-black text-slate-500 uppercase mb-8 tracking-[0.3em]">Identity Import Protocol</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Alias</label>
                            <input type="text" value={newKey.name} onChange={e => setNewKey({...newKey, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Production Master Key"/>
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Private Key Data</label>
                            <div className="relative">
                               <input type="text" value={newKey.privateKeyPath as string} onChange={e => setNewKey({...newKey, privateKeyPath: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white font-mono text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="-----BEGIN OPENSSH..."/>
                               <button onClick={() => fileInputRef.current?.click()} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-slate-800 rounded-xl text-indigo-400"><Upload size={18}/></button>
                               <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => {
                                 const f = e.target.files?.[0];
                                 if (f) {
                                   const r = new FileReader();
                                   r.onload = ev => setNewKey({...newKey, privateKeyPath: ev.target?.result as string});
                                   r.readAsText(f);
                                 }
                               }} />
                            </div>
                         </div>
                      </div>
                      <button onClick={handleAddSSHKey} className="w-full mt-8 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 active:scale-[0.98] transition-all">Securely Commit to Vault</button>
                   </div>
                </div>
              )}
           </div>
        </div>
      )}
    </div>
  );
};
