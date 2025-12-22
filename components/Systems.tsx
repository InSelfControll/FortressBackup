
import React, { useState, useEffect, useRef } from 'react';
import { System, BackupJob, JobStatus, SSHKey, EncryptedData } from '../types';
import * as Encryption from '../services/encryptionService';
import { 
  Server, Plus, Terminal, Laptop, X, Activity, Shield, 
  Clock, CheckCircle2, Key, Trash2, Save, Wifi, Loader2, Check, User, Upload, GripVertical, AlertCircle, Eye, EyeOff, Calendar, ChevronDown, Lock, Unlock, ShieldAlert, ShieldCheck, RefreshCw
} from 'lucide-react';

interface SystemsProps {
  systems: System[];
  jobs: BackupJob[];
  onAddSystem: (s: System) => void;
  sshKeys: SSHKey[];
  onAddSSHKey: (key: SSHKey) => void;
  onDeleteSSHKey: (id: string) => void;
  onUpdateSSHKeysOrder?: (keys: SSHKey[]) => void;
}

const SYSTEM_DRAFT_KEY = 'fortress_system_draft';
const VAULT_SALT_KEY = 'fortress_vault_salt';

const HealthVisualization = ({ health }: { health: number }) => {
  const [isHovered, setIsHovered] = useState(false);
  const getHealthColor = (val: number) => {
    if (val > 80) return 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]';
    if (val > 40) return 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)]';
    return 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.4)]';
  };

  return (
    <div className="relative space-y-1.5 cursor-pointer pt-2" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-wider">
        <span>Vitality Index</span>
        <span className={health > 80 ? 'text-emerald-400' : health > 40 ? 'text-amber-400' : 'text-rose-400'}>{health}%</span>
      </div>
      <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-700/50">
        <div className={`h-full transition-all duration-1000 ease-out ${getHealthColor(health)}`} style={{ width: `${health}%` }} />
      </div>
      {isHovered && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-2 bg-slate-900 border border-indigo-500/30 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-30 pointer-events-none animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center gap-3 whitespace-nowrap">
            <div className={`p-1.5 rounded-md ${health > 80 ? 'bg-emerald-500/10' : health > 40 ? 'bg-amber-500/10' : 'bg-rose-500/10'}`}>
              <Activity size={14} className={health > 80 ? 'text-emerald-400' : health > 40 ? 'text-amber-400' : 'text-rose-400'} />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-black text-white uppercase tracking-tighter">System Pulse</span>
              <span className="text-[13px] font-bold text-slate-300">{health}.00% Integrity</span>
            </div>
          </div>
          <div className="absolute bottom-[-5px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-slate-900 border-r border-b border-indigo-500/30 rotate-45"></div>
        </div>
      )}
    </div>
  );
};

export const Systems: React.FC<SystemsProps> = ({ systems, jobs, onAddSystem, sshKeys, onAddSSHKey, onDeleteSSHKey, onUpdateSSHKeysOrder }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isKeyManagerOpen, setIsKeyManagerOpen] = useState(false);
  
  // Vault Encryption States
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [masterPassword, setMasterPassword] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [decryptedKeyMap, setDecryptedKeyMap] = useState<Record<string, { path: string; passphrase?: string }>>({});

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [keyTestResult, setKeyTestResult] = useState<'success' | 'fail' | null>(null);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [testTargetSystemId, setTestTargetSystemId] = useState<string>('');
  
  // Tracking test results for existing keys
  const [existingKeyTests, setExistingKeyTests] = useState<Record<string, 'loading' | 'success' | 'fail' | null>>({});

  const [newKey, setNewKey] = useState<Partial<SSHKey>>({ 
    name: '', 
    privateKeyPath: '', 
    expiryDate: '', 
    passphrase: '' 
  });
  
  const [newSystem, setNewSystem] = useState<Partial<System>>({ 
    name: '', host: '', type: 'remote', port: 22, username: 'root' 
  });

  const [draggedKeyId, setDraggedKeyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const draft = localStorage.getItem(SYSTEM_DRAFT_KEY);
    if (draft) {
      try { setNewSystem(JSON.parse(draft)); } catch (e) { console.error(e); }
    }
    if (systems.length > 0) setTestTargetSystemId(systems[0].id);
  }, [systems]);

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(SYSTEM_DRAFT_KEY, JSON.stringify(newSystem));
    }, 1000);
    return () => clearTimeout(timer);
  }, [newSystem]);

  // Handle Vault Unlocking
  const handleUnlockVault = async () => {
    if (!masterPassword) return;
    setIsUnlocking(true);
    setUnlockError(null);

    try {
      let saltStr = localStorage.getItem(VAULT_SALT_KEY);
      let salt: Uint8Array;
      if (!saltStr) {
        salt = Encryption.generateSalt();
        localStorage.setItem(VAULT_SALT_KEY, Encryption.bufferToBase64(salt));
      } else {
        salt = Encryption.base64ToBuffer(saltStr);
      }

      const key = await Encryption.deriveKey(masterPassword, salt);
      
      // Verification phase
      if (sshKeys.length > 0) {
        const firstEncrypted = sshKeys.find(k => k.isEncrypted);
        if (firstEncrypted) {
          const path = firstEncrypted.privateKeyPath as EncryptedData;
          await Encryption.decrypt(path.ciphertext, path.iv, key);
        }
      }

      setVaultKey(key);
      setMasterPassword('');
      // Decrypt for UI view
      const newMap: Record<string, { path: string; passphrase?: string }> = {};
      for (const k of sshKeys) {
        if (k.isEncrypted) {
          try {
            const pathData = k.privateKeyPath as EncryptedData;
            const path = await Encryption.decrypt(pathData.ciphertext, pathData.iv, key);
            let passphrase = '';
            if (k.passphrase) {
              const passData = k.passphrase as EncryptedData;
              passphrase = await Encryption.decrypt(passData.ciphertext, passData.iv, key);
            }
            newMap[k.id] = { path, passphrase };
          } catch (e) {
            console.error("Failed to decrypt key:", k.name);
          }
        } else {
          newMap[k.id] = { path: k.privateKeyPath as string, passphrase: k.passphrase as string };
        }
      }
      setDecryptedKeyMap(newMap);
    } catch (e) {
      setUnlockError('Invalid Master Password. Identity vault remains sealed.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleTestExistingKey = (keyId: string) => {
    setExistingKeyTests(prev => ({ ...prev, [keyId]: 'loading' }));
    
    // Simulate real SSH handshake
    setTimeout(() => {
      const targetSystem = systems.find(s => s.id === testTargetSystemId);
      const isSuccess = targetSystem?.status !== 'offline' && Math.random() > 0.2;
      setExistingKeyTests(prev => ({ ...prev, [keyId]: isSuccess ? 'success' : 'fail' }));
      
      // Clear status after some time
      setTimeout(() => {
        setExistingKeyTests(prev => ({ ...prev, [keyId]: null }));
      }, 3000);
    }, 1500);
  };

  const handleTestKeyConnection = () => {
    if (!newKey.privateKeyPath) return;
    setIsTestingKey(true);
    setKeyTestResult(null);
    setTimeout(() => {
      setIsTestingKey(false);
      const targetSystem = systems.find(s => s.id === testTargetSystemId);
      setKeyTestResult(targetSystem?.status !== 'offline' && Math.random() > 0.15 ? 'success' : 'fail');
    }, 1200);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setNewKey(prev => ({ ...prev, privateKeyPath: content }));
      };
      reader.readAsText(file);
    }
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

      setDecryptedKeyMap(prev => ({
        ...prev,
        [id]: { path: newKey.privateKeyPath as string, passphrase: newKey.passphrase as string }
      }));

      setNewKey({ name: '', privateKeyPath: '', expiryDate: '', passphrase: '' });
      setKeyTestResult(null);
    }
  };

  const onDragStart = (id: string) => setDraggedKeyId(id);
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (targetId: string) => {
    if (!draggedKeyId || draggedKeyId === targetId) return;
    const currentKeys = [...sshKeys].sort((a, b) => a.order - b.order);
    const draggedIdx = currentKeys.findIndex(k => k.id === draggedKeyId);
    const targetIdx = currentKeys.findIndex(k => k.id === targetId);
    const [movedItem] = currentKeys.splice(draggedIdx, 1);
    currentKeys.splice(targetIdx, 0, movedItem);
    const updatedKeys = currentKeys.map((k, idx) => ({ ...k, order: idx }));
    if (onUpdateSSHKeysOrder) onUpdateSSHKeysOrder(updatedKeys);
    setDraggedKeyId(null);
  };

  const getExpirationStatus = (expiryDate?: string) => {
    if (!expiryDate) return null;
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: 'Expired', bg: 'bg-rose-600 animate-pulse', urgent: true };
    if (diffDays <= 7) return { label: `Rotate (${diffDays}d)`, bg: 'bg-amber-600 animate-pulse', urgent: true };
    return { label: `Valid (${diffDays}d)`, bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', urgent: false };
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white tracking-tight">Systems</h2>
        <div className="flex gap-3">
          <button onClick={() => setIsKeyManagerOpen(true)} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-4 py-2 rounded-xl text-sm transition-all active:scale-95 shadow-sm">
            <Key size={16} /> Manage SSH Keys
          </button>
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 transition-all active:scale-95">
            <Plus size={16} /> Add System
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {systems.map((system) => (
          <div key={system.id} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 hover:border-indigo-500/40 transition-all cursor-pointer group hover:bg-slate-800/60 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full -translate-y-16 translate-x-16 group-hover:scale-150 transition-transform duration-700" />
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div className="p-3.5 bg-slate-700/30 rounded-2xl text-indigo-400 group-hover:bg-indigo-600/10 group-hover:scale-110 transition-all shadow-inner border border-slate-600/20">
                {system.type === 'remote' ? <Server size={28} /> : <Laptop size={28} />}
              </div>
              <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all shadow-sm ${system.status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                {system.status}
              </div>
            </div>
            <h3 className="text-xl font-black text-slate-100 mb-1 relative z-10">{system.name}</h3>
            <p className="text-xs text-slate-500 font-mono flex items-center gap-2 mb-6 bg-slate-900/50 w-fit px-2 py-1 rounded-lg border border-slate-700/30 relative z-10">
              <Terminal size={14} className="text-indigo-500/60" /> {system.username}@{system.host}
            </p>
            <HealthVisualization health={system.health} />
          </div>
        ))}
      </div>

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
                <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-900/40">
                  <div className="max-w-md w-full bg-slate-800/40 p-10 rounded-[2.5rem] border border-slate-700 text-center shadow-2xl">
                    <div className="mb-6 mx-auto w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center border border-indigo-500/20">
                      <Lock size={40} className="text-indigo-400 animate-pulse" />
                    </div>
                    <h4 className="text-2xl font-black text-white mb-2">Unlock Enterprise Vault</h4>
                    <p className="text-sm text-slate-500 mb-8 leading-relaxed uppercase tracking-widest font-bold text-[10px]">Provide your Master Password to derive the session decryption key.</p>
                    <div className="space-y-4">
                      <div className="relative">
                        <input 
                          type="password" 
                          value={masterPassword} 
                          onChange={e => setMasterPassword(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleUnlockVault()}
                          placeholder="Master Password" 
                          className="w-full bg-slate-900 border border-slate-700 rounded-2xl px-6 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-center font-bold tracking-[0.3em] shadow-inner"
                        />
                      </div>
                      {unlockError && <p className="text-rose-400 text-xs font-black uppercase tracking-tight flex items-center justify-center gap-2"><AlertCircle size={14}/> {unlockError}</p>}
                      <button 
                        onClick={handleUnlockVault}
                        disabled={isUnlocking || !masterPassword}
                        className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                      >
                        {isUnlocking ? <Loader2 className="animate-spin" size={20}/> : <Unlock size={20}/>}
                        {isUnlocking ? 'Deriving Key...' : 'Unlock Identities'}
                      </button>
                    </div>
                  </div>
                  <p className="mt-8 text-[10px] text-slate-600 uppercase font-black tracking-[0.3em]">AES-256-GCM Authenticated Encryption Layer</p>
                </div>
              ) : (
                <div className="p-8 flex-1 overflow-y-auto space-y-12">
                   {/* Add Key Section */}
                   <div className="bg-slate-800/30 p-8 rounded-[2rem] border border-slate-700/50 shadow-inner max-w-5xl mx-auto">
                      <h4 className="text-[11px] font-black text-slate-400 uppercase mb-8 tracking-[0.3em] flex items-center gap-3">
                        <Plus size={16} className="text-indigo-400" /> Secure Import Protocol
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Vault Alias</label>
                            <input type="text" value={newKey.name} onChange={e => setNewKey({...newKey, name: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl px-5 py-4 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-700 shadow-inner" placeholder="e.g. Master Production Key"/>
                         </div>
                         <div className="space-y-2 lg:col-span-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Private Identity Source</label>
                            <div className="flex flex-col sm:flex-row gap-3">
                              <div className="relative flex-1">
                                <input type="text" value={newKey.privateKeyPath as string} onChange={e => setNewKey({...newKey, privateKeyPath: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl px-5 py-4 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-700 font-mono shadow-inner pr-14" placeholder="id_rsa contents or path"/>
                                <button onClick={() => fileInputRef.current?.click()} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-xl transition-all border border-slate-700 active:scale-95 shadow-lg"><Upload size={18}/></button>
                                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                              </div>
                              <div className="flex gap-2">
                                 <div className="relative min-w-[140px]">
                                   <select value={testTargetSystemId} onChange={e => setTestTargetSystemId(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-4 text-xs font-bold text-slate-300 outline-none appearance-none pr-10 cursor-pointer hover:bg-slate-700 transition-colors">
                                     <option value="" disabled>Target System</option>
                                     {systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                   </select>
                                   <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                                 </div>
                                 <button onClick={handleTestKeyConnection} disabled={!newKey.privateKeyPath || isTestingKey || !testTargetSystemId} className={`px-6 flex items-center gap-2 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg ${keyTestResult === 'success' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : keyTestResult === 'fail' ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'}`}>
                                  {isTestingKey ? <Loader2 size={18} className="animate-spin" /> : keyTestResult === 'success' ? <CheckCircle2 size={18} /> : keyTestResult === 'fail' ? <AlertCircle size={18} /> : <Wifi size={18} />}
                                  <span>{isTestingKey ? '...' : 'Verify'}</span>
                                 </button>
                              </div>
                            </div>
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Passphrase <span className="text-slate-600">(Optional)</span></label>
                            <div className="relative">
                              <input type={showPassphrase ? 'text' : 'password'} value={newKey.passphrase as string} onChange={e => setNewKey({...newKey, passphrase: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl px-5 py-4 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none pr-14 transition-all shadow-inner" placeholder="Enter secret"/>
                              <button type="button" onClick={() => setShowPassphrase(!showPassphrase)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-indigo-400 transition-colors p-2 rounded-xl hover:bg-slate-800">{showPassphrase ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                            </div>
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Expiration</label>
                            <input type="date" value={newKey.expiryDate} onChange={e => setNewKey({...newKey, expiryDate: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl px-5 py-4 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none [color-scheme:dark] transition-all shadow-inner"/>
                         </div>
                         <div className="flex items-end">
                            <button onClick={handleAddSSHKey} className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[1.25rem] text-[12px] font-black uppercase tracking-[0.2em] transition-all shadow-2xl shadow-indigo-600/30 flex items-center justify-center gap-4 active:scale-[0.98]">
                              <Save size={20}/> Encrypt & Commit
                            </button>
                         </div>
                      </div>
                   </div>
                   
                   {/* Key List Section */}
                   <div className="space-y-6 max-w-5xl mx-auto pb-8">
                      <div className="grid grid-cols-12 gap-6 px-8 text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-slate-800 pb-4">
                        <div className="col-span-4 flex items-center gap-3"><Shield size={16} className="text-slate-600"/> Identity Descriptor</div>
                        <div className="col-span-2 flex items-center gap-3"><Calendar size={16} className="text-slate-600"/> Created</div>
                        <div className="col-span-4 flex items-center gap-3"><Clock size={16} className="text-slate-600"/> Health & Connection</div>
                        <div className="col-span-2 text-right">Actions</div>
                      </div>
                      
                      {sshKeys.length === 0 ? (
                        <div className="text-center py-24 text-slate-500 text-sm border-2 border-dashed border-slate-800/50 rounded-[3rem] flex flex-col items-center gap-5 bg-slate-800/10">
                          <Shield size={56} className="text-slate-800" />
                          <div className="max-w-xs text-slate-400 font-bold uppercase tracking-widest text-xs">No identities found in the vault</div>
                        </div>
                      ) : (
                        <div className="grid gap-3">
                          {[...sshKeys].sort((a,b)=>a.order-b.order).map(k => {
                            const expiryStatus = getExpirationStatus(k.expiryDate);
                            const decData = decryptedKeyMap[k.id];
                            const testStatus = existingKeyTests[k.id];

                            return (
                              <div key={k.id} draggable onDragStart={() => onDragStart(k.id)} onDragOver={onDragOver} onDrop={() => onDrop(k.id)} className={`grid grid-cols-12 gap-6 items-center p-6 bg-slate-800/40 rounded-3xl border transition-all group ${draggedKeyId === k.id ? 'opacity-40 scale-[0.98] border-indigo-500 bg-indigo-500/5' : 'border-slate-700/50 hover:border-indigo-500/30 hover:bg-slate-800/80 shadow-sm'}`}>
                                <div className="col-span-4 flex items-center gap-5 min-w-0">
                                  <div className="p-2 cursor-grab active:cursor-grabbing text-slate-700 hover:text-indigo-400 transition-colors rounded-xl hover:bg-slate-900"><GripVertical size={24}/></div>
                                  <div className={`p-4 rounded-2xl border flex-shrink-0 transition-all shadow-inner ${expiryStatus?.urgent ? 'bg-rose-600 text-white border-rose-400' : 'bg-indigo-600/10 text-indigo-400 border-indigo-500/20'}`}>
                                    <Key size={22}/>
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-base font-black text-white truncate leading-none mb-1.5">{k.name}</p>
                                    <p className="text-[10px] text-slate-500 font-mono bg-slate-900 px-2 py-1 rounded-lg border border-slate-700/50 truncate max-w-[220px]">
                                      {decData ? decData.path : '• • • • • • • •'}
                                    </p>
                                  </div>
                                </div>
                                <div className="col-span-2 flex items-center gap-3"><span className="text-sm font-bold text-slate-400">{k.createdAt}</span></div>
                                <div className="col-span-4 flex items-center gap-4">
                                  {expiryStatus ? (
                                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase border tracking-widest shadow-lg ${expiryStatus.bg} ${expiryStatus.urgent ? 'text-white' : 'text-emerald-400'}`}>
                                      {expiryStatus.label}
                                    </div>
                                  ) : <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-black tracking-widest opacity-60"><Shield size={14}/> Permanent</div>}
                                  
                                  {/* Inline Connection Test Status */}
                                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                                    testStatus === 'loading' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 animate-pulse' :
                                    testStatus === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                                    testStatus === 'fail' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                                    'bg-slate-900/50 text-slate-600 border-slate-800'
                                  }`}>
                                    {testStatus === 'loading' ? <RefreshCw size={14} className="animate-spin" /> : 
                                     testStatus === 'success' ? <CheckCircle2 size={14} /> : 
                                     testStatus === 'fail' ? <AlertCircle size={14} /> : 
                                     <Wifi size={14} className="opacity-40" />}
                                    <span>{testStatus || 'Unchecked'}</span>
                                  </div>
                                </div>
                                <div className="col-span-2 text-right flex items-center justify-end gap-2">
                                  <button 
                                    onClick={() => handleTestExistingKey(k.id)} 
                                    title="Run Connectivity Test"
                                    className="p-3 text-slate-600 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-2xl transition-all opacity-0 group-hover:opacity-100 border border-transparent hover:border-indigo-500/20 active:scale-90"
                                  >
                                    <RefreshCw size={22}/>
                                  </button>
                                  <button onClick={() => onDeleteSSHKey(k.id)} className="p-3 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-2xl transition-all opacity-0 group-hover:opacity-100 border border-transparent hover:border-rose-500/20 active:scale-90"><Trash2 size={22}/></button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                   </div>
                </div>
              )}
           </div>
        </div>
      )}
    </div>
  );
};
