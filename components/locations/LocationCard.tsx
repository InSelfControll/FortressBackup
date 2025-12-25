import React from 'react';
import { Location } from '../../types';
import { Cloud, Globe, Server, Folder, HardDrive, CheckCircle2, XCircle, Loader2, TestTube, Edit3, Trash2 } from 'lucide-react';

interface LocationCardProps {
    location: Location;
    onEdit: (loc: Location) => void;
    onDelete: (id: string) => void;
    onTestConnection: (loc: Location) => void;
    isTesting: boolean;
    connectionResult?: 'success' | 'failed';
    isDeleteConfirm: boolean;
    setDeleteConfirm: (id: string | null) => void;
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

const getLocationConfig = (type: string) => {
    return LOCATION_TYPES.find(t => t.id === type) || LOCATION_TYPES[0];
};

export const LocationCard: React.FC<LocationCardProps> = ({
    location, onEdit, onDelete, onTestConnection, isTesting, connectionResult, isDeleteConfirm, setDeleteConfirm
}) => {
    const config = getLocationConfig(location.type);
    const Icon = config.icon;

    return (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 hover:border-indigo-500/40 transition-all group">
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
                    <span className="text-[10px] font-black uppercase text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-800">{location.type}</span>
                </div>
            </div>

            <h3 className="text-lg font-bold text-white mb-1">{location.name}</h3>
            <p className="text-xs text-slate-500 font-mono truncate mb-4" title={location.path}>{location.path}</p>

            {location.region && (
                <p className="text-[10px] text-slate-600 mb-4">Region: {location.region}</p>
            )}

            <div className="flex justify-between items-center pt-4 border-t border-slate-700/50">
                <button
                    onClick={() => onTestConnection(location)}
                    disabled={isTesting}
                    className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400 hover:text-indigo-400 transition-colors disabled:opacity-50"
                >
                    {isTesting ? <Loader2 size={12} className="animate-spin" /> : <TestTube size={12} />}
                    Test Connection
                </button>
                <div className="flex gap-2">
                    <button onClick={() => onEdit(location)} className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-700 rounded-lg transition-colors" title="Edit">
                        <Edit3 size={16} />
                    </button>
                    {isDeleteConfirm ? (
                        <button onClick={() => onDelete(location.id)} className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold uppercase rounded-lg">
                            Confirm
                        </button>
                    ) : (
                        <button onClick={() => setDeleteConfirm(location.id)} className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="Delete">
                            <Trash2 size={16} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
