import React, { useState } from 'react';
import { System } from '../../types';
import { Server, Laptop, Terminal, Box, Edit3, Trash2, DownloadCloud } from 'lucide-react';

interface SystemCardProps {
    system: System;
    onEdit: (system: System) => void;
    onDelete: (id: string) => void;
    onDeploy: (system: System) => void;
}

export const SystemCard: React.FC<SystemCardProps> = ({ system, onEdit, onDelete, onDeploy }) => {
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    return (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-[2rem] p-8 hover:border-indigo-500/40 transition-all group hover:bg-slate-800/60 shadow-xl relative overflow-hidden flex flex-col min-h-[300px]">
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
                            onClick={(e) => { e.stopPropagation(); onEdit(system); }}
                            className="p-2 bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
                            title="Edit System"
                        >
                            <Edit3 size={14} />
                        </button>
                        {deleteConfirm ? (
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete(system.id); }}
                                className="p-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition-all text-[10px] font-bold"
                            >
                                Confirm
                            </button>
                        ) : (
                            <button
                                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(true); }}
                                className="p-2 bg-slate-700/50 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-xl transition-all"
                                title="Delete System"
                                onMouseLeave={() => setDeleteConfirm(false)}
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                        <button
                            onClick={(e) => { e.stopPropagation(); onDeploy(system); }}
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
    );
};
