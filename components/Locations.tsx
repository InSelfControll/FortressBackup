
import React, { useState } from 'react';
import { Location } from '../types';
import { HardDrive, Plus, Trash2, Cloud, Folder, Server, Globe, Save, X, Settings2, ShieldCheck, Link } from 'lucide-react';

interface LocationsProps {
  locations: Location[];
  onAddLocation: (loc: Location) => void;
  onDeleteLocation: (id: string) => void;
}

export const Locations: React.FC<LocationsProps> = ({ locations, onAddLocation, onDeleteLocation }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCustomS3, setIsCustomS3] = useState(false);
  const [newLocation, setNewLocation] = useState<Partial<Location>>({ 
    type: 's3', 
    path: '',
    endpoint: 'https://s3.amazonaws.com',
    region: 'us-east-1'
  });

  const handleAdd = () => {
    if (newLocation.name && newLocation.path) {
      onAddLocation({
        id: crypto.randomUUID(),
        name: newLocation.name,
        type: newLocation.type as 's3' | 'sftp' | 'local' | 'b2',
        path: newLocation.path,
        endpoint: isCustomS3 ? newLocation.endpoint : undefined,
        region: newLocation.region,
        accessKey: newLocation.accessKey,
        secretKey: newLocation.secretKey
      });
      setIsModalOpen(false);
      setNewLocation({ type: 's3', path: '', endpoint: 'https://s3.amazonaws.com', region: 'us-east-1' });
      setIsCustomS3(false);
    }
  };

  const getLocationIcon = (type: string) => {
    switch (type) {
      case 's3': return <Cloud size={24} />;
      case 'b2': return <Globe size={24} />;
      case 'sftp': return <Server size={24} />;
      case 'local': return <Folder size={24} />;
      default: return <HardDrive size={24} />;
    }
  };

  const getLocationColor = (type: string) => {
    switch (type) {
      case 's3': return 'bg-orange-500/10 text-orange-400';
      case 'b2': return 'bg-blue-500/10 text-blue-400';
      case 'sftp': return 'bg-indigo-500/10 text-indigo-400';
      case 'local': return 'bg-emerald-500/10 text-emerald-400';
      default: return 'bg-slate-500/10 text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Backend Locations</h2>
          <p className="text-slate-400 text-sm mt-1 uppercase font-black text-[10px] tracking-widest">Storage Destinations Registry</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl transition-all font-bold text-sm shadow-lg shadow-indigo-500/20 active:scale-95"
        >
          <Plus size={18} />
          Register Backend
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {locations.map((loc) => (
          <div key={loc.id} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 hover:border-indigo-500/40 transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full -translate-y-12 translate-x-12" />
            <div className="flex items-start justify-between mb-4 relative z-10">
              <div className={`p-3.5 rounded-2xl border shadow-inner ${getLocationColor(loc.type)}`}>
                {getLocationIcon(loc.type)}
              </div>
              <div className="flex gap-2">
                <button className="p-2 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-xl transition-colors opacity-0 group-hover:opacity-100"><Settings2 size={18}/></button>
                <button 
                  onClick={() => onDeleteLocation(loc.id)}
                  className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
            <h3 className="text-xl font-black text-slate-100 tracking-tight">{loc.name}</h3>
            <div className="mt-3 flex items-center gap-2">
               <span className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-[10px] uppercase font-black tracking-widest text-slate-400">{loc.type}</span>
               {loc.endpoint && <span className="px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-[10px] uppercase font-black tracking-widest text-indigo-400">Compatible</span>}
            </div>
            <div className="mt-5 pt-5 border-t border-slate-700/30">
              <p className="text-xs text-slate-500 font-mono flex items-center gap-2 truncate" title={loc.path}>
                <Link size={12}/> {loc.path}
              </p>
              {loc.endpoint && <p className="text-[10px] text-slate-600 font-mono mt-1 ml-5 truncate">{loc.endpoint}</p>}
            </div>
          </div>
        ))}
        
        {locations.length === 0 && (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-800/50 rounded-[3rem] bg-slate-800/10 flex flex-col items-center gap-5">
             <div className="w-16 h-16 bg-slate-800 rounded-3xl flex items-center justify-center text-slate-700"><HardDrive size={32} /></div>
             <div>
               <h3 className="text-lg font-black text-slate-400 uppercase tracking-widest">No Destinations Linked</h3>
               <p className="text-slate-600 text-xs mt-1 uppercase font-bold">Register an S3 or SFTP backend to initialize backup streams</p>
             </div>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 p-8 rounded-[2.5rem] w-full max-w-2xl shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-8 duration-500">
            <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-2xl font-black text-white tracking-tight">Register Storage Backend</h3>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">Establishing high-bandwidth connection parameters</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"><X size={24}/></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 col-span-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Alias</label>
                <input 
                  type="text" 
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-inner"
                  placeholder="e.g. Production Cluster Bucket"
                  value={newLocation.name || ''}
                  onChange={e => setNewLocation({...newLocation, name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Backend Protocol</label>
                <select 
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer"
                  value={newLocation.type}
                  onChange={e => setNewLocation({...newLocation, type: e.target.value as any})}
                >
                  <option value="s3">S3 Compatible</option>
                  <option value="b2">Backblaze B2</option>
                  <option value="sftp">SFTP / SSH</option>
                  <option value="local">Native Filesystem</option>
                </select>
              </div>

              {newLocation.type === 's3' && (
                <div className="flex items-end gap-3 pb-4">
                   <button 
                    onClick={() => setIsCustomS3(!isCustomS3)}
                    className={`flex-1 py-4 px-4 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${isCustomS3 ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                   >
                     {isCustomS3 ? 'Custom Endpoint Enabled' : 'Use S3 Compatible Endpoint'}
                   </button>
                </div>
              )}

              <div className="space-y-2 col-span-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">
                    {newLocation.type === 'local' ? 'Filesystem Path' : 'Bucket Name / Target Folder'}
                </label>
                <input 
                  type="text" 
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm shadow-inner"
                  placeholder={
                    newLocation.type === 'local' ? '/mnt/backup/archive' : 'company-backups-2025'
                  }
                  value={newLocation.path || ''}
                  onChange={e => setNewLocation({...newLocation, path: e.target.value})}
                />
              </div>

              {isCustomS3 && (
                <>
                  <div className="space-y-2 col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Endpoint URL</label>
                    <input type="text" value={newLocation.endpoint} onChange={e => setNewLocation({...newLocation, endpoint: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono text-xs" placeholder="https://minio.internal.io"/>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Region</label>
                    <input type="text" value={newLocation.region} onChange={e => setNewLocation({...newLocation, region: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-white focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="us-east-1"/>
                  </div>
                </>
              )}

              {(newLocation.type === 's3' || newLocation.type === 'b2') && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Access Key ID</label>
                    <input type="text" value={newLocation.accessKey} onChange={e => setNewLocation({...newLocation, accessKey: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono" placeholder="AKIA..."/>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Secret Access Key</label>
                    <input type="password" value={newLocation.secretKey} onChange={e => setNewLocation({...newLocation, secretKey: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono" placeholder="••••••••"/>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-4 mt-10">
              <button onClick={() => setIsModalOpen(false)} className="px-6 py-4 rounded-2xl text-slate-500 hover:text-white font-black uppercase text-[10px] tracking-widest transition-colors">Cancel</button>
              <button 
                onClick={handleAdd}
                disabled={!newLocation.name || !newLocation.path}
                className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-2xl shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50"
              >
                Register Backend
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
