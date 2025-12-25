import React, { useState } from 'react';
import { Lock, AlertTriangle } from 'lucide-react';

export const SecurityTab: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-4 bg-rose-600/10 rounded-2xl border border-rose-500/20">
          <Lock className="text-rose-400" size={28} />
        </div>
        <div>
          <h3 className="text-xl font-black text-white">Vault Security</h3>
          <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">Master password management</p>
        </div>
      </div>

      <div className="max-w-md mx-auto space-y-6 p-8 bg-slate-800/20 rounded-3xl border border-slate-800">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Current Password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
            placeholder="••••••••"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
            placeholder="••••••••"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
            placeholder="••••••••"
          />
        </div>

        {newPassword && confirmPassword && newPassword !== confirmPassword && (
          <p className="text-rose-400 text-xs font-bold flex items-center gap-2">
            <AlertTriangle size={14} /> Passwords do not match
          </p>
        )}

        <button
          disabled={!currentPassword || !newPassword || newPassword !== confirmPassword || newPassword.length < 8}
          className="w-full py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-xl shadow-rose-600/20 transition-all active:scale-95 disabled:opacity-50"
        >
          Update Master Password
        </button>
      </div>

      <div className="p-6 bg-amber-500/5 rounded-2xl border border-amber-500/10">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-amber-400 mt-0.5" size={18} />
          <div>
            <h4 className="text-sm font-bold text-amber-400">Warning</h4>
            <p className="text-xs text-slate-400 mt-1">Changing your master password will require re-encrypting all stored SSH keys. This operation cannot be undone.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
