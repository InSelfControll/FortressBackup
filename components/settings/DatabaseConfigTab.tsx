import React, { useState } from 'react';
import { DatabaseConfig, DatabaseType } from '../../types';
import { Database, Loader2, RefreshCw, Save, CheckCircle2 } from 'lucide-react';

interface DatabaseConfigTabProps {
  config: DatabaseConfig | null;
  onUpdate: (config: DatabaseConfig) => void;
}

export const DatabaseConfigTab: React.FC<DatabaseConfigTabProps> = ({ config, onUpdate }) => {
  const [localConfig, setLocalConfig] = useState<DatabaseConfig>(config || { type: DatabaseType.SQLITE });
  const [isDbTesting, setIsDbTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const testDbConnection = () => {
    setIsDbTesting(true);
    setTimeout(() => setIsDbTesting(false), 1500);
  };

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
        <div className="p-4 bg-blue-600/10 rounded-2xl border border-blue-500/20">
          <Database className="text-blue-400" size={28} />
        </div>
        <div>
          <h3 className="text-xl font-black text-white">Persistent Storage Core</h3>
          <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">Job history and metadata storage</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <button
          onClick={() => setLocalConfig({ type: DatabaseType.SQLITE })}
          className={`relative p-8 rounded-2xl border flex flex-col items-center gap-5 transition-all ${localConfig.type === DatabaseType.SQLITE
            ? 'bg-indigo-600/10 border-indigo-500 shadow-xl'
            : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
            }`}
        >
          <div className="text-center">
            <h4 className="text-white font-bold text-lg">SQLite (Embedded)</h4>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Zero-config local storage</p>
          </div>
        </button>

        <button
          onClick={() => setLocalConfig({ type: DatabaseType.POSTGRES, host: 'localhost', port: 5432, database: 'fortress' })}
          className={`relative p-8 rounded-2xl border flex flex-col items-center gap-5 transition-all ${localConfig.type === DatabaseType.POSTGRES
            ? 'bg-indigo-600/10 border-indigo-500 shadow-xl'
            : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
            }`}
        >
          <div className="text-center">
            <h4 className="text-white font-bold text-lg">PostgreSQL (External)</h4>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Enterprise distributed storage</p>
          </div>
        </button>
      </div>

      {localConfig.type === DatabaseType.POSTGRES && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-slate-800/20 rounded-3xl border border-slate-800 animate-in slide-in-from-top-4 duration-300">
          <div className="space-y-1 col-span-2">
            <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Host</label>
            <input type="text" value={localConfig.host} onChange={e => setLocalConfig({ ...localConfig, host: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="db.internal.io" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Port</label>
            <input type="number" value={localConfig.port} onChange={e => setLocalConfig({ ...localConfig, port: parseInt(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="5432" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Database</label>
            <input type="text" value={localConfig.database} onChange={e => setLocalConfig({ ...localConfig, database: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="fortress" />
          </div>
          <div className="flex items-end col-span-4">
            <button onClick={testDbConnection} className="text-[10px] font-black uppercase text-indigo-400 flex items-center gap-2 bg-indigo-500/5 px-4 py-2 rounded-lg border border-indigo-500/10 hover:bg-indigo-500/10 transition-colors">
              {isDbTesting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {isDbTesting ? 'Testing...' : 'Test Connection'}
            </button>
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
