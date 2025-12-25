import React, { useState, useRef } from 'react';
import { SSHKey } from '../../types';
import { useCreateSSHKey, useDeleteSSHKey } from '../../client/api/mutations';
import { ShieldCheck, X, Key, Trash2, Upload } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface SSHKeyManagerProps {
    isOpen: boolean;
    onClose: () => void;
    sshKeys: SSHKey[];
}

export const SSHKeyManager = ({ isOpen, onClose, sshKeys }: SSHKeyManagerProps) => {
    const [isAddingKey, setIsAddingKey] = useState(false);
    const [newKey, setNewKey] = useState({
        name: '',
        privateKey: '',
        passphrase: ''
    });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const createSSHKeyMutation = useCreateSSHKey();
    const deleteSSHKeyMutation = useDeleteSSHKey();

    const handleAddSSHKey = async () => {
        if (!newKey.name || !newKey.privateKey) return;

        setIsAddingKey(true);
        createSSHKeyMutation.mutate({
            name: newKey.name,
            privateKeyPath: newKey.privateKey,
            isEncrypted: !!newKey.passphrase,
            passphrase: newKey.passphrase
        } as any, {
            onSuccess: () => {
                setNewKey({ name: '', privateKey: '', passphrase: '' });
                toast.success('SSH Key added successfully');
                setIsAddingKey(false);
            },
            onError: () => {
                toast.error('Failed to add SSH key');
                setIsAddingKey(false);
            }
        });
    };

    if (!isOpen) return null;

    return (
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
                    <button onClick={onClose} className="p-3 text-slate-500 hover:text-white transition-colors hover:bg-slate-800 rounded-2xl border border-transparent hover:border-slate-700"><X size={28} /></button>
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
                                                onClick={() => deleteSSHKeyMutation.mutate(key.id, { onSuccess: () => toast.success('Key deleted') })}
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
    );
};
