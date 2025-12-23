import React, { useState } from 'react';
import { Location } from '../types';
import { HardDrive, Plus, Trash2, Cloud, Folder, Server, Globe, X, Edit3, TestTube, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface LocationsProps {
  locations: Location[];
  onAddLocation: (loc: Location) => void;
  onDeleteLocation: (id: string) => void;
  onUpdateLocation?: (loc: Location) => void;
}

const LOCATION_TYPES = [
  { id: 's3', name: 'Amazon S3', icon: Cloud, color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  { id: 'b2', name: 'Backblaze B2', icon: Globe, color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  { id: 'sftp', name: 'SFTP Server', icon: Server, color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
  { id: 'nfs', name: 'NFS/Local Path', icon: Folder, color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  { id: 'gcs', name: 'Google Cloud Storage', icon: Cloud, color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  { id: 'azure', name: 'Azure Blob Storage', icon: Cloud, color: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  { id: 'gdrive', name: 'Google Drive (Rclone)', icon: HardDrive, color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  { id: 'onedrive', name: 'OneDrive (Rclone)', icon: Cloud, color: 'bg-blue-600/10 text-blue-300 border-blue-500/20' },
];

export const Locations: React.FC<LocationsProps> = ({ locations, onAddLocation, onDeleteLocation, onUpdateLocation }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [isCustomS3, setIsCustomS3] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [connectionResults, setConnectionResults] = useState<Record<string, 'success' | 'failed'>>({});

  const [newLocation, setNewLocation] = useState<Partial<Location>>({
    type: 's3',
    path: '',
    endpoint: 'https://s3.amazonaws.com',
    region: 'us-east-1'
  });

  const resetForm = () => {
    setNewLocation({ type: 's3', path: '', endpoint: 'https://s3.amazonaws.com', region: 'us-east-1' });
    setEditingLocation(null);
    setIsCustomS3(false);
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (loc: Location) => {
    setEditingLocation(loc);
    setNewLocation({
      name: loc.name,
      type: loc.type,
      path: loc.path,
      endpoint: loc.endpoint,
      region: loc.region,
      accessKey: loc.accessKey,
      secretKey: loc.secretKey
    });
    setIsCustomS3(!!loc.endpoint && loc.endpoint !== 'https://s3.amazonaws.com');
    setIsModalOpen(true);
  };

  const handleSubmit = () => {
    if (newLocation.name && newLocation.path) {
      const locationData: Location = {
        id: editingLocation?.id || crypto.randomUUID(),
        name: newLocation.name,
        type: newLocation.type as Location['type'],
        path: newLocation.path,
        endpoint: isCustomS3 ? newLocation.endpoint : undefined,
        region: newLocation.region,
        accessKey: newLocation.accessKey,
        secretKey: newLocation.secretKey
      };

      if (editingLocation && onUpdateLocation) {
        onUpdateLocation(locationData);
      } else {
        onAddLocation(locationData);
      }

      setIsModalOpen(false);
      resetForm();
    }
  };

  const handleDelete = (id: string) => {
    onDeleteLocation(id);
    setDeleteConfirm(null);
  };

  const testConnection = async (loc: Location) => {
    setTestingConnection(loc.id);
    // Simulate connection test
    await new Promise(resolve => setTimeout(resolve, 1500));
    const success = Math.random() > 0.3; // 70% success rate for demo
    setConnectionResults(prev => ({ ...prev, [loc.id]: success ? 'success' : 'failed' }));
    setTestingConnection(null);
  };

  const getLocationConfig = (type: string) => {
    return LOCATION_TYPES.find(t => t.id === type) || LOCATION_TYPES[0];
  };

  const renderTypeSpecificFields = () => {
    const type = newLocation.type;

    switch (type) {
      case 's3':
        return (
          <>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Bucket Name</label>
              <input type="text" value={newLocation.path || ''} onChange={e => setNewLocation({ ...newLocation, path: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="my-backup-bucket" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Region</label>
                <select value={newLocation.region || 'us-east-1'} onChange={e => setNewLocation({ ...newLocation, region: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none">
                  <option value="us-east-1">US East (N. Virginia)</option>
                  <option value="us-west-2">US West (Oregon)</option>
                  <option value="eu-west-1">EU (Ireland)</option>
                  <option value="eu-central-1">EU (Frankfurt)</option>
                  <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-2">
                  <input type="checkbox" checked={isCustomS3} onChange={e => setIsCustomS3(e.target.checked)} className="rounded" /> Custom Endpoint
                </label>
                {isCustomS3 && (
                  <input type="text" value={newLocation.endpoint || ''} onChange={e => setNewLocation({ ...newLocation, endpoint: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="https://s3.custom.com" />
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Access Key ID</label>
                <input type="text" value={newLocation.accessKey || ''} onChange={e => setNewLocation({ ...newLocation, accessKey: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="AKIAIOSFODNN7EXAMPLE" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Secret Access Key</label>
                <input type="password" value={newLocation.secretKey || ''} onChange={e => setNewLocation({ ...newLocation, secretKey: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="••••••••••••••••" />
              </div>
            </div>
          </>
        );

      case 'sftp':
        return (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Host</label>
                <input type="text" value={newLocation.endpoint || ''} onChange={e => setNewLocation({ ...newLocation, endpoint: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="backup.example.com" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Port</label>
                <input type="number" value={newLocation.region || '22'} onChange={e => setNewLocation({ ...newLocation, region: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="22" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Remote Path</label>
              <input type="text" value={newLocation.path || ''} onChange={e => setNewLocation({ ...newLocation, path: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono outline-none focus:ring-2 focus:ring-indigo-500" placeholder="/backups/production" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Username</label>
                <input type="text" value={newLocation.accessKey || ''} onChange={e => setNewLocation({ ...newLocation, accessKey: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="backup_user" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Password / Key</label>
                <input type="password" value={newLocation.secretKey || ''} onChange={e => setNewLocation({ ...newLocation, secretKey: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Use SSH key or password" />
              </div>
            </div>
          </>
        );

      case 'nfs':
        return (
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Local Directory Path</label>
            <input type="text" value={newLocation.path || ''} onChange={e => setNewLocation({ ...newLocation, path: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono outline-none focus:ring-2 focus:ring-indigo-500" placeholder="/mnt/backup-storage" />
          </div>
        );

      case 'b2':
        return (
          <>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Bucket Name</label>
              <input type="text" value={newLocation.path || ''} onChange={e => setNewLocation({ ...newLocation, path: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="my-b2-bucket" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Application Key ID</label>
                <input type="text" value={newLocation.accessKey || ''} onChange={e => setNewLocation({ ...newLocation, accessKey: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0012345678abcdef" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Application Key</label>
                <input type="password" value={newLocation.secretKey || ''} onChange={e => setNewLocation({ ...newLocation, secretKey: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="••••••••••••••••" />
              </div>
            </div>
          </>
        );

      case 'gdrive':
      case 'onedrive':
        return (
          <>
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-4">
              <p className="text-xs text-amber-400">
                <strong>Rclone Required:</strong> This backend requires rclone configuration. Run <code className="bg-slate-800 px-1 rounded">rclone config</code> to set up authentication.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Rclone Remote Name</label>
              <input type="text" value={newLocation.path || ''} onChange={e => setNewLocation({ ...newLocation, path: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="myremote:/backup-folder" />
            </div>
          </>
        );

      default:
        return (
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Path / Bucket</label>
            <input type="text" value={newLocation.path || ''} onChange={e => setNewLocation({ ...newLocation, path: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="backup-path" />
          </div>
        );
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Storage Registry</h2>
          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">Backup Destination Endpoints</p>
        </div>
        <button onClick={openCreateModal} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-black text-sm shadow-lg shadow-indigo-500/20 transition-all active:scale-95">
          <Plus size={18} /> Add Location
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {locations.length === 0 && (
          <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-800 rounded-[2rem] bg-slate-800/20">
            <HardDrive size={48} className="mx-auto text-slate-700 mb-4" />
            <h3 className="text-lg font-bold text-slate-400">No Storage Locations</h3>
            <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">Add your first backup destination to start protecting your data.</p>
          </div>
        )}
        {locations.map((loc) => {
          const config = getLocationConfig(loc.type);
          const Icon = config.icon;
          const connectionResult = connectionResults[loc.id];

          return (
            <div key={loc.id} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 hover:border-indigo-500/40 transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl ${config.color} border`}>
                  <Icon size={24} />
                </div>
                <div className="flex items-center gap-2">
                  {connectionResult && (
                    <span className={`flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-1 rounded ${connectionResult === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                      {connectionResult === 'success' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      {connectionResult}
                    </span>
                  )}
                  <span className="text-[10px] font-black uppercase text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-800">{loc.type}</span>
                </div>
              </div>

              <h3 className="text-lg font-bold text-white mb-1">{loc.name}</h3>
              <p className="text-xs text-slate-500 font-mono truncate mb-4" title={loc.path}>{loc.path}</p>

              {loc.region && (
                <p className="text-[10px] text-slate-600 mb-4">Region: {loc.region}</p>
              )}

              <div className="flex justify-between items-center pt-4 border-t border-slate-700/50">
                <button
                  onClick={() => testConnection(loc)}
                  disabled={testingConnection === loc.id}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400 hover:text-indigo-400 transition-colors disabled:opacity-50"
                >
                  {testingConnection === loc.id ? <Loader2 size={12} className="animate-spin" /> : <TestTube size={12} />}
                  Test Connection
                </button>
                <div className="flex gap-2">
                  <button onClick={() => openEditModal(loc)} className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-700 rounded-lg transition-colors" title="Edit">
                    <Edit3 size={16} />
                  </button>
                  {deleteConfirm === loc.id ? (
                    <button onClick={() => handleDelete(loc.id)} className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold uppercase rounded-lg">
                      Confirm
                    </button>
                  ) : (
                    <button onClick={() => setDeleteConfirm(loc.id)} className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="Delete">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-[2rem] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 duration-300">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-black text-white">
                {editingLocation ? 'Edit Location' : 'Add Storage Location'}
              </h3>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="p-2 text-slate-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Location Type Selection */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 block mb-3">Storage Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {LOCATION_TYPES.slice(0, 4).map(type => {
                    const TypeIcon = type.icon;
                    return (
                      <button
                        key={type.id}
                        onClick={() => setNewLocation({ ...newLocation, type: type.id as Location['type'], path: '', endpoint: '', accessKey: '', secretKey: '' })}
                        className={`p-3 rounded-xl border text-center transition-all ${newLocation.type === type.id ? `${type.color} border-current` : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}
                      >
                        <TypeIcon size={20} className="mx-auto mb-2" />
                        <span className="text-[10px] font-bold uppercase block">{type.name}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {LOCATION_TYPES.slice(4).map(type => {
                    const TypeIcon = type.icon;
                    return (
                      <button
                        key={type.id}
                        onClick={() => setNewLocation({ ...newLocation, type: type.id as Location['type'], path: '', endpoint: '', accessKey: '', secretKey: '' })}
                        className={`p-3 rounded-xl border text-center transition-all ${newLocation.type === type.id ? `${type.color} border-current` : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}
                      >
                        <TypeIcon size={20} className="mx-auto mb-2" />
                        <span className="text-[10px] font-bold uppercase block truncate">{type.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Location Name */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Display Name</label>
                <input type="text" value={newLocation.name || ''} onChange={e => setNewLocation({ ...newLocation, name: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Production S3 Backup" />
              </div>

              {/* Type-specific fields */}
              {renderTypeSpecificFields()}
            </div>

            <div className="p-6 border-t border-slate-800 flex justify-end gap-4 bg-slate-800/20">
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="px-6 py-3 text-slate-400 hover:text-white font-bold transition-colors">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={!newLocation.name || !newLocation.path}
                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
              >
                {editingLocation ? 'Update Location' : 'Add Location'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
