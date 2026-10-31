import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { changePassword } from '../../client/api/auth';
import { requireData } from '../../client/api/client';

export const SecurityTab: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || newPassword !== confirmPassword) return;
    setBusy(true); setError(''); setSaved(false);
    try {
      requireData(await changePassword(currentPassword, newPassword));
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setSaved(true);
    } catch (error) { setError(error instanceof Error ? error.message : 'Password update failed'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-8">
    <div className="flex items-center gap-4"><Lock className="text-indigo-400 shrink-0" size={28}/><div>
      <h3 className="text-xl font-black text-white">Account Security</h3>
      <p className="text-sm text-slate-400">Change your local sign-in password. SSO passwords are managed by your identity provider.</p>
    </div></div>
    <form onSubmit={submit} className="max-w-md space-y-5">
      <label className="block text-sm text-slate-300">Current password<input type="password" autoComplete="current-password" required maxLength={256} value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} className="block w-full mt-2 p-3 rounded-xl bg-slate-950 border border-slate-700"/></label>
      <label className="block text-sm text-slate-300">New password<input type="password" aria-label="New password" autoComplete="new-password" required minLength={12} maxLength={256} value={newPassword} onChange={e=>setNewPassword(e.target.value)} className="block w-full mt-2 p-3 rounded-xl bg-slate-950 border border-slate-700"/><span className="text-xs text-slate-500">12–256 characters</span></label>
      <label className="block text-sm text-slate-300">Confirm new password<input type="password" autoComplete="new-password" required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} className="block w-full mt-2 p-3 rounded-xl bg-slate-950 border border-slate-700"/></label>
      {confirmPassword && newPassword !== confirmPassword && <p role="alert" className="text-sm text-rose-400">Passwords do not match</p>}
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
      {saved && <p role="status" className="text-sm text-emerald-400">Password updated. Other sessions have been revoked.</p>}
      <button disabled={busy || !currentPassword || newPassword.length < 12 || newPassword !== confirmPassword} className="w-full py-3 bg-indigo-600 text-white rounded-xl disabled:opacity-50">{busy ? 'Updating...' : 'Update Password'}</button>
    </form>
  </div>;
};
