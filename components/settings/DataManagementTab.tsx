import React, { useState } from 'react';
import { Settings as SettingsIcon, Download, Upload, Trash2 } from 'lucide-react';

interface DataManagementTabProps {
  onExport: () => void;
  onImport: (data: string) => void;
  onReset: () => void;
}

export const DataManagementTab: React.FC<DataManagementTabProps> = ({ onExport, onImport, onReset }) => {
  const [importData, setImportData] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleImport = () => {
    if (importData) {
      onImport(importData);
      setImportData('');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-4 bg-slate-600/10 rounded-2xl border border-slate-500/20">
          <SettingsIcon className="text-slate-400" size={28} />
        </div>
        <div>
          <h3 className="text-xl font-black text-white">Data Management</h3>
          <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">Export, import, and reset</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Export */}
        <div className="p-8 bg-slate-800/20 rounded-3xl border border-slate-800 space-y-4">
          <div className="flex items-center gap-3 text-emerald-400">
            <Download size={20} />
            <h4 className="text-sm font-bold uppercase tracking-widest">Export Configuration</h4>
          </div>
          <p className="text-xs text-slate-500">Download all systems, jobs, and locations as a JSON file. SSH keys are excluded for security.</p>
          <button
            onClick={onExport}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-xl shadow-emerald-600/20 transition-all active:scale-95"
          >
            Export Data
          </button>
        </div>

        {/* Import */}
        <div className="p-8 bg-slate-800/20 rounded-3xl border border-slate-800 space-y-4">
          <div className="flex items-center gap-3 text-blue-400">
            <Upload size={20} />
            <h4 className="text-sm font-bold uppercase tracking-widest">Import Configuration</h4>
          </div>
          <textarea
            value={importData}
            onChange={e => setImportData(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono h-24 resize-none"
            placeholder="Paste exported JSON here..."
          />
          <button
            onClick={handleImport}
            disabled={!importData}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-600/20 transition-all active:scale-95 disabled:opacity-50"
          >
            Import Data
          </button>
        </div>
      </div>

      {/* Reset */}
      <div className="p-8 bg-rose-500/5 rounded-3xl border border-rose-500/10 space-y-4">
        <div className="flex items-center gap-3 text-rose-400">
          <Trash2 size={20} />
          <h4 className="text-sm font-bold uppercase tracking-widest">Danger Zone</h4>
        </div>
        <p className="text-xs text-slate-400">Reset all settings and data. This will clear everything including SSH keys, jobs, systems, and locations. This action cannot be undone.</p>

        {!showResetConfirm ? (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="py-4 px-8 bg-rose-600/10 hover:bg-rose-600 text-rose-400 hover:text-white rounded-xl font-black uppercase tracking-widest text-xs border border-rose-500/20 transition-all"
          >
            Reset Application
          </button>
        ) : (
          <div className="flex items-center gap-4 animate-in slide-in-from-left duration-300">
            <button
              onClick={() => { onReset(); setShowResetConfirm(false); }}
              className="py-4 px-8 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-xl shadow-rose-600/20 transition-all"
            >
              Confirm Reset
            </button>
            <button
              onClick={() => setShowResetConfirm(false)}
              className="py-4 px-8 text-slate-500 hover:text-white"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
