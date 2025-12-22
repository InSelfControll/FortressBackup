import React, { useState } from 'react';
import { Location } from '../types';
import { HardDrive, Plus, Trash2, Cloud, Folder, Server, Globe, Save, X } from 'lucide-react';

interface LocationsProps {
  locations: Location[];
  onAddLocation: (loc: Location) => void;
  onDeleteLocation: (id: string) => void;
}

export const Locations: React.FC<LocationsProps> = ({ locations, onAddLocation, onDeleteLocation }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newLocation, setNewLocation] = useState<Partial<Location>>({ type: 's3', path: '' });

  const handleAdd = () => {
    if (newLocation.name && newLocation.path) {
      onAddLocation({
        id: crypto.randomUUID(),
        name: newLocation.name,
        type: newLocation.type as 's3' | 'sftp' | 'local' | 'b2',
        path: newLocation.path
      });
      setIsModalOpen(false);
      setNewLocation({ type: 's3', path: '' });
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
          <h2 className="text-2xl font-bold text-white">Locations</h2>
          <p className="text-slate-400 text-sm mt-1">Manage storage backends and backup destinations.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors font-medium text-sm shadow-lg shadow-indigo-500/20"
        >
          <Plus size={16} />
          Add Location
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {locations.map((loc) => (
          <div key={loc.id} className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-colors group relative">
            <div className="flex items-start justify-between mb-4">
              <div className={`p-3 rounded-lg ${getLocationColor(loc.type)}`}>
                {getLocationIcon(loc.type)}
              </div>
              <button 
                onClick={() => onDeleteLocation(loc.id)}
                className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={18} />
              </button>
            </div>
            <h3 className="text-lg font-bold text-slate-100">{loc.name}</h3>
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
               <span className="px-2 py-0.5 bg-slate-700 rounded text-xs uppercase font-medium">{loc.type}</span>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <p className="text-xs text-slate-500 font-mono truncate" title={loc.path}>{loc.path}</p>
            </div>
          </div>
        ))}
        
        {locations.length === 0 && (
          <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-800/20">
             <HardDrive size={48} className="mx-auto text-slate-700 mb-4" />
             <h3 className="text-lg font-medium text-slate-400">No Locations Configured</h3>
             <p className="text-slate-500 text-sm mt-2">Add a storage location to start saving backups.</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Add Location</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Name</label>
                <input 
                  type="text" 
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="e.g. AWS US-East Archive"
                  value={newLocation.name || ''}
                  onChange={e => setNewLocation({...newLocation, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Storage Type</label>
                <select 
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                  value={newLocation.type}
                  onChange={e => setNewLocation({...newLocation, type: e.target.value as any})}
                >
                  <option value="s3">Amazon S3</option>
                  <option value="b2">Backblaze B2</option>
                  <option value="sftp">SFTP Server</option>
                  <option value="local">Local Path / NAS</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                    {newLocation.type === 'local' ? 'Filesystem Path' : 
                     newLocation.type === 'sftp' ? 'SSH URI' : 'Bucket / Endpoint'}
                </label>
                <input 
                  type="text" 
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none font-mono text-sm"
                  placeholder={
                    newLocation.type === 'local' ? '/mnt/backup/archive' : 
                    newLocation.type === 'sftp' ? 'sftp://user@host:/path' : 's3://my-bucket-name'
                  }
                  value={newLocation.path || ''}
                  onChange={e => setNewLocation({...newLocation, path: e.target.value})}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-8">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-lg text-slate-300 hover:text-white text-sm font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={handleAdd}
                disabled={!newLocation.name || !newLocation.path}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Add Location
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};