import React, { useState } from 'react';
import { System, SSHKey } from '../../types';
import { useCreateSystem } from '../../client/api/mutations';
import { toast } from 'react-hot-toast';

interface AddSystemModalProps {
    isOpen: boolean;
    onClose: () => void;
    sshKeys: SSHKey[];
}

export const AddSystemModal: React.FC<AddSystemModalProps> = ({ isOpen, onClose, sshKeys }) => {
    const createSystemMutation = useCreateSystem();

    const [newSystem, setNewSystem] = useState<Partial<System> & { sshKeyId?: string }>({
        name: '', host: '', type: 'remote', port: 22, username: 'root', sshKeyId: ''
    });

    const handleAddSystem = () => {
        if (newSystem.name && newSystem.host) {
            createSystemMutation.mutate({
                ...newSystem,
                id: crypto.randomUUID(),
                status: 'online',
                lastSeen: 'Now',
                health: 100,
                installedTools: []
            } as System, {
                onSuccess: () => {
                    onClose();
                    setNewSystem({ name: '', host: '', type: 'remote', port: 22, username: 'root' });
                    toast.success('System registered successfully');
                }
            });
        }
    };

    if (!isOpen) return null;

    return (
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
                    <button onClick={onClose} className="px-6 py-4 text-slate-500 hover:text-white font-black uppercase text-[10px]">Cancel</button>
                    <button onClick={handleAddSystem} className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-600/20 transition-all">Enroll System</button>
                </div>
            </div>
        </div>
    );
};
