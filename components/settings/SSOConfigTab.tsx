import React, { useState } from 'react';
import { SSOConfig } from '../../types';
import { Shield, Eye, EyeOff, Copy, Loader2, Save, CheckCircle2 } from 'lucide-react';

interface SSOConfigTabProps {
  config: SSOConfig | null;
  onUpdate: (config: SSOConfig) => void;
}

export const SSOConfigTab: React.FC<SSOConfigTabProps> = ({ config, onUpdate }) => {
  const [localConfig, setLocalConfig] = useState<SSOConfig>(config || { provider: null });
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const redirectUri = window.location.origin + '/';

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    await new Promise(resolve => setTimeout(resolve, 500));
    onUpdate(localConfig);
    setIsSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };


  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-4 bg-emerald-600/10 rounded-2xl border border-emerald-500/20">
          <Shield className="text-emerald-400" size={28} />
        </div>
        <div>
          <h3 className="text-xl font-black text-white">Identity Provider</h3>
          <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">SSO authentication configuration</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { id: 'google', label: 'Google Workspace', icon: '🔵' },
          { id: 'github', label: 'GitHub Enterprise', icon: '⚫' },
          { id: 'oidc', label: 'Custom OIDC', icon: '🔷' }
        ].map((prov) => (
          <button
            key={prov.id}
            onClick={() => setLocalConfig({ ...localConfig, provider: prov.id as any })}
            className={`relative p-6 rounded-2xl border flex flex-col items-center gap-4 transition-all ${localConfig.provider === prov.id
              ? 'bg-indigo-600/10 border-indigo-500 shadow-xl'
              : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
              }`}
          >
            <span className="text-3xl">{prov.icon}</span>
            <span className="text-sm font-bold text-white">{prov.label}</span>
          </button>
        ))}
      </div>

      {localConfig.provider && (
        <div className="space-y-6 p-8 bg-slate-800/20 rounded-3xl border border-slate-800 animate-in slide-in-from-top-4 duration-300">
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
              <div className="space-y-2 col-span-2">
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
                onClick={() => navigator.clipboard.writeText(redirectUri)}
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-white transition-colors"
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

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
