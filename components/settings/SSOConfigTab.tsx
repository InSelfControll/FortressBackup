import { copyText } from '../../client/browser';
import toast from 'react-hot-toast';
import React, { useEffect, useState } from 'react';
import { SSOConfig } from '../../types';
import { Shield, Eye, EyeOff, Copy, Loader2, Save, CheckCircle2 } from 'lucide-react';

interface SSOConfigTabProps {
  config: SSOConfig | null;
  onUpdate: (config: SSOConfig) => void | Promise<void>;
  authMode?: 'local' | 'sso';
  onUpdateAuthMode?: (mode: 'local' | 'sso') => void | Promise<void>;
}

export const SSOConfigTab: React.FC<SSOConfigTabProps> = ({ config, onUpdate, authMode = 'local', onUpdateAuthMode }) => {
  const [localConfig, setLocalConfig] = useState<SSOConfig>(config || { provider: null });
  const [selectedMode, setSelectedMode] = useState(authMode);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  useEffect(() => setSaveSuccess(false), [localConfig, selectedMode]);

  const redirectUri = window.location.origin + '/login';

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError('');
    try {
      if (selectedMode === 'sso' && (localConfig.provider !== 'github' || !localConfig.clientId?.trim())) throw new Error('Select GitHub and enter its client ID before enabling SSO');
      await onUpdate(localConfig);
      if (selectedMode !== authMode && onUpdateAuthMode) await onUpdateAuthMode(selectedMode);
      setSaveSuccess(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8">
        <div className="p-4 bg-emerald-600/10 rounded-2xl border border-emerald-500/20">
          <Shield className="text-emerald-400" size={28} />
        </div>
        <div>
          <h3 className="text-xl font-black text-white">Identity Provider</h3>
          <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">SSO authentication configuration</p>
        </div>
      </div>

      {onUpdateAuthMode && <label className="block text-sm text-slate-300">Sign-in method
        <select aria-label="Sign-in method" value={selectedMode} onChange={e=>setSelectedMode(e.target.value as 'local'|'sso')} className="block w-full mt-2 rounded-xl p-3 bg-slate-950 border border-slate-700">
          <option value="local">Local email and password</option><option value="sso">GitHub SSO</option>
        </select>
      </label>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { id: 'google', label: 'Google Workspace', icon: '🔵' },
          { id: 'github', label: 'GitHub Enterprise', icon: '⚫' },
          { id: 'oidc', label: 'Custom OIDC', icon: '🔷' }
        ].map((prov) => (
          <button
            key={prov.id}
            disabled={prov.id !== 'github'}
            title={prov.id === 'github' ? undefined : 'This provider is not implemented by the controller'}
            onClick={() => setLocalConfig({ ...localConfig, provider: prov.id as any })}
            className={`relative p-4 sm:p-6 rounded-2xl border flex flex-col items-center gap-4 transition-all ${localConfig.provider === prov.id
              ? 'bg-indigo-600/10 border-indigo-500 shadow-xl'
              : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
              }`}
          >
            <span className="text-3xl">{prov.icon}</span>
            <span className="text-sm font-bold text-white">{prov.label}{prov.id !== 'github' && ' (unavailable)'}</span>
          </button>
        ))}
      </div>

      {localConfig.provider && (
        <div className="space-y-6 p-4 sm:p-8 bg-slate-800/20 rounded-3xl border border-slate-800 animate-in slide-in-from-top-4 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Client ID</label>
              <input
                type="text"
                value={localConfig.clientId || ''}
                onChange={e => setLocalConfig({ ...localConfig, clientId: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono"
                placeholder="oauth-client-id"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Client Secret</label>
              <div className="relative">
                <input
                  type={showClientSecret ? "text" : "password"}
                  value={localConfig.clientSecret || ''}
                  onChange={e => setLocalConfig({ ...localConfig, clientSecret: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono pr-12"
                  placeholder="••••••••"
                />
                <button
                  onClick={() => setShowClientSecret(!showClientSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  {showClientSecret ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {localConfig.provider === 'oidc' && (
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Discovery URL</label>
                <input
                  type="text"
                  value={localConfig.discoveryUrl || ''}
                  onChange={e => setLocalConfig({ ...localConfig, discoveryUrl: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono"
                  placeholder="https://auth.company.com/.well-known/openid-configuration"
                />
              </div>
            )}
          </div>

          <div className="p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
            <p className="text-xs text-slate-400 mb-2">Configure this <strong>Redirect URI</strong> in your provider:</p>
            <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
              <code className="flex-1 text-xs font-mono text-indigo-300 truncate">{redirectUri}</code>
              <button
                aria-label="Copy redirect URI" onClick={() => void copyText(redirectUri).then(() => toast.success('Redirect URI copied')).catch(error => toast.error(error.message))}
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-white transition-colors"
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {saveError && <p role="alert" className="text-sm text-rose-400">{saveError}</p>}
      {saveSuccess && <p role="status" className="text-sm text-emerald-400">Settings saved.</p>}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : saveSuccess ? <CheckCircle2 size={16} /> : <Save size={16} />}
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};
