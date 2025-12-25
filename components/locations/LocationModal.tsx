import React, { useState, useEffect } from 'react';
import { Location } from '../../types';
import { useCreateLocation, useUpdateLocation } from '../../client/api/mutations';
import { toast } from 'react-hot-toast';
import { Cloud, Globe, Server, Folder, HardDrive, X } from 'lucide-react';

interface LocationModalProps {
    location: Location | null;
    isOpen: boolean;
    onClose: () => void;
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

export const LocationModal: React.FC<LocationModalProps> = ({ location, isOpen, onClose }) => {
    const createLocationMutation = useCreateLocation();
    const updateLocationMutation = useUpdateLocation();

    const [newLocation, setNewLocation] = useState<Partial<Location>>({
        type: 's3',
        path: '',
        endpoint: 'https://s3.amazonaws.com',
        region: 'us-east-1'
    });

    const [isCustomS3, setIsCustomS3] = useState(false);

    useEffect(() => {
        if (location) {
            setNewLocation({
                name: location.name,
                type: location.type,
                path: location.path,
                endpoint: location.endpoint,
                region: location.region,
                accessKey: location.accessKey,
                secretKey: location.secretKey
            });
            setIsCustomS3(!!location.endpoint && location.endpoint !== 'https://s3.amazonaws.com');
        } else {
            setNewLocation({ type: 's3', path: '', endpoint: 'https://s3.amazonaws.com', region: 'us-east-1' });
            setIsCustomS3(false);
        }
    }, [location, isOpen]);

    const handleSubmit = () => {
        if (newLocation.name && newLocation.path) {
            const locationData: Location = {
                id: location?.id || crypto.randomUUID(),
                name: newLocation.name,
                type: newLocation.type as Location['type'],
                path: newLocation.path,
                endpoint: isCustomS3 ? newLocation.endpoint : undefined,
                region: newLocation.region,
                accessKey: newLocation.accessKey,
                secretKey: newLocation.secretKey
            };

            if (location) {
                updateLocationMutation.mutate(locationData, {
                    onSuccess: () => {
                        onClose();
                        toast.success('Location updated successfully');
                    },
                    onError: () => toast.error('Failed to update location')
                });
            } else {
                createLocationMutation.mutate(locationData, {
                    onSuccess: () => {
                        onClose();
                        toast.success('Location added successfully');
                    },
                    onError: () => toast.error('Failed to add location')
                });
            }
        }
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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-[2rem] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 duration-300">
                <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="text-xl font-black text-white">
                        {location ? 'Edit Location' : 'Add Storage Location'}
                    </h3>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-white transition-colors">
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
                    <button onClick={onClose} className="px-6 py-3 text-slate-400 hover:text-white font-bold transition-colors">Cancel</button>
                    <button
                        onClick={handleSubmit}
                        disabled={!newLocation.name || !newLocation.path}
                        className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
                    >
                        {location ? 'Update Location' : 'Add Location'}
                    </button>
                </div>
            </div>
        </div>
    );
};
