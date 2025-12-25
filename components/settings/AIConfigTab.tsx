import React, { useState } from 'react';
import { AIConfig, AIProvider } from '../../types';
import { Brain, XCircle, Sparkles, Globe, EyeOff, Eye, Loader2, CheckCircle2, Save } from 'lucide-react';

interface AIConfigTabProps {
  config: AIConfig;
  onUpdate: (config: AIConfig) => void;
}

export const AIConfigTab: React.FC<AIConfigTabProps> = ({ config, onUpdate }) => {
  const [localConfig, setLocalConfig] = useState<AIConfig>(config);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate save
    onUpdate(localConfig);
    setIsSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-4 bg-indigo-600/10 rounded-2xl border border-indigo-500/20">
          <Brain className="text-indigo-400" size={28} />
        </div>
        <div>
          <h3 className="text-xl font-black text-white">AI Orchestration Engine</h3>
          <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">Intelligent backup planning assistant</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { id: AIProvider.NONE, label: 'Disabled', icon: XCircle, desc: 'No AI assistance' },
          { id: AIProvider.GEMINI, label: 'Google Gemini', icon: Sparkles, desc: 'Google AI models' },
          { id: AIProvider.OPENAI, label: 'OpenAI / Custom', icon: Globe, desc: 'GPT or compatible APIs' }
        ].map((prov) => (
          <button
            key={prov.id}
            onClick={() => setLocalConfig({ ...localConfig, provider: prov.id })}
            className={`relative p-6 rounded-2xl border flex flex-col items-center gap-4 transition-all ${localConfig.provider === prov.id
              ? 'bg-indigo-600/10 border-indigo-500 shadow-xl'
              : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
              }`}
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-inner ${localConfig.provider === prov.id
              ? 'bg-indigo-600 text-white border-indigo-400'
              : 'bg-slate-900 text-slate-600 border-slate-700'
              }`}>
              <prov.icon size={24} />
            </div>
            <div className="text-center">
              <span className="text-sm font-bold text-white block">{prov.label}</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest">{prov.desc}</span>
            </div>
          </button>
        ))}
      </div>

      {localConfig.provider !== AIProvider.NONE && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 bg-slate-800/20 rounded-3xl border border-slate-800 animate-in slide-in-from-top-4 duration-300">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={localConfig.apiKey || ''}
                onChange={e => setLocalConfig({ ...localConfig, apiKey: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono pr-12"
                placeholder="sk-..."
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Model</label>
            <input
              type="text"
              value={localConfig.model || ''}
              onChange={e => setLocalConfig({ ...localConfig, model: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
              placeholder={localConfig.provider === AIProvider.GEMINI ? "gemini-2.0-flash" : "gpt-4o"}
            />
          </div>

          {localConfig.provider === AIProvider.OPENAI && (
            <div className="space-y-2 col-span-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Base URL (Optional)</label>
              <input
                type="text"
                value={localConfig.baseUrl || ''}
                onChange={e => setLocalConfig({ ...localConfig, baseUrl: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono"
                placeholder="https://api.openai.com/v1"
              />
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : saveSuccess ? <CheckCircle2 size={16} /> : <Save size={16} />}
          {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};
