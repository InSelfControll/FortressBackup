import React, { useState, useEffect } from 'react';
import { Location } from '../../types';
import { useCreateLocation, useUpdateLocation } from '../../client/api/mutations';
import { toast } from 'react-hot-toast';
import {CloudSignIn} from './CloudSignIn';
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
    { id: 'gdrive', name: 'Google Drive', icon: HardDrive, color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
    { id: 'onedrive', name: 'OneDrive', icon: Cloud, color: 'bg-blue-600/10 text-blue-300 border-blue-500/20' },
];

type LocationPayload = Omit<Location, 'id' | 'accessKey' | 'secretKey'> & {
    id?: string;
    access_key?: string;
    secret_key?: string;
    host_public_key?: string;
};

const parseSftpTarget = (path: string): Partial<Location> => {
    if (!path.startsWith('sftp://')) return {};
    try {
        const target = new URL(path);
        return {
            path: target.pathname,
            endpoint: target.hostname,
            region: target.port || '22',
            accessKey: target.username || undefined
        };
    } catch {
        return {};
    }
};

const buildSftpTarget = (location: Partial<Location>): string => {
    const path = location.path as string;
    if (path.startsWith('sftp:')) return path;
    const remotePath = path.startsWith('/') ? path : `/${path}`;
    const username = location.accessKey ? `${location.accessKey}@` : '';
    return `sftp://${username}${location.endpoint}:${location.region || '22'}${remotePath}`;
};

export const getLocationFormState = (location: Location | null): Partial<Location> => {
    if (!location) {
        return { type: 's3', path: '', endpoint: 'https://s3.amazonaws.com', region: 'us-east-1' };
    }

    const serverLocation = location as Location & { host_public_key?: string };
    const sftpFields = location.type === 'sftp' ? parseSftpTarget(location.path) : {};
    return {
        name: location.name,
        type: location.type,
        path: sftpFields.path ?? location.path,
        endpoint: sftpFields.endpoint ?? location.endpoint,
        region: sftpFields.region ?? location.region,
        accessKey: sftpFields.accessKey ?? location.accessKey,
        secretKey: location.secretKey,
        hasAccessKey:location.hasAccessKey,hasSecretKey:location.hasSecretKey,
        hostPublicKey: location.hostPublicKey ?? serverLocation.host_public_key
    };
};

export const canSubmitLocation = (location: Partial<Location>): boolean => Boolean(
    location.name && location.path && (location.type !== 'sftp' || location.hostPublicKey?.trim()) &&
    (location.type !== 'azure' || ((location.accessKey || location.hasAccessKey) && (location.secretKey || location.hasSecretKey))) &&
    (!['gdrive','gcs','onedrive'].includes(location.type||'') || location.secretKey || location.hasSecretKey)
);

export const buildLocationData = (
    newLocation: Partial<Location>,
    isCustomS3: boolean,
    id?: string
): LocationPayload => ({
    ...(id ? { id } : {}),
    name: newLocation.name as string,
    type: newLocation.type as Location['type'],
    path: newLocation.type === 'sftp' ? buildSftpTarget(newLocation) : newLocation.path as string,
    endpoint: newLocation.type === 'sftp' || (newLocation.type === 's3' && isCustomS3) ? newLocation.endpoint : undefined,
    region: newLocation.region,
    access_key: newLocation.accessKey || undefined,
    secret_key: newLocation.secretKey || undefined,
    ...(newLocation.type === 'sftp' ? { host_public_key: newLocation.hostPublicKey?.trim() } : {})
});

export const LocationModal: React.FC<LocationModalProps> = ({ location, isOpen, onClose }) => {
    const createLocationMutation = useCreateLocation();
    const updateLocationMutation = useUpdateLocation();
    const [saveError, setSaveError] = useState('');
    const [oauthFlowId,setOAuthFlowId]=useState<string|null>(null);
    const isSaving = createLocationMutation.isPending || updateLocationMutation.isPending;

    const [newLocation, setNewLocation] = useState<Partial<Location>>(() => getLocationFormState(location));
    const [isCustomS3, setIsCustomS3] = useState(
        !!location?.endpoint && location.endpoint !== 'https://s3.amazonaws.com'
    );

    useEffect(() => {
        setSaveError('');setOAuthFlowId(null);
        setNewLocation(getLocationFormState(location));
        setIsCustomS3(!!location?.endpoint && location.endpoint !== 'https://s3.amazonaws.com');
    }, [location, isOpen]);

    const canSave=canSubmitLocation({...newLocation,hasSecretKey:newLocation.hasSecretKey||!!oauthFlowId});
    const signedIn=(id:string)=>{setOAuthFlowId(id);if(newLocation.type!=='gcs')setNewLocation(current=>({...current,path:'fortress:'+((current.path||'FortressBackup').replace(/^[^:]+:/,''))}))};
    const handleSubmit = () => {
        if (!canSave || isSaving) return;
        setSaveError('');

        // The API assigns IDs. Client-side UUID generation is unavailable on HTTP LAN addresses.
        const locationData = {...buildLocationData(newLocation, isCustomS3, location?.id),...(oauthFlowId?{oauth_flow_id:oauthFlowId}:{})};
        if (location) {
            updateLocationMutation.mutate({ ...locationData, id: location.id }, {
                onSuccess: () => {
                    onClose();
                    toast.success('Location updated successfully');
                },
                onError: error => setSaveError(error.message || 'Failed to update location')
            });
        } else {
            createLocationMutation.mutate(locationData, {
                onSuccess: () => {
                    onClose();
                    toast.success('Location added successfully');
                },
                onError: error => setSaveError(error.message || 'Failed to add location')
            });
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Host Public Key</label>
                            <textarea required rows={3} value={newLocation.hostPublicKey || ''} onChange={e => setNewLocation({ ...newLocation, hostPublicKey: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5..." />
                            <p className="text-xs text-slate-400">Paste the server's public key starting with ssh-ed25519 or ssh-rsa, rather than its SHA256 fingerprint.</p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Remote Path</label>
                            <input type="text" value={newLocation.path || ''} onChange={e => setNewLocation({ ...newLocation, path: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono outline-none focus:ring-2 focus:ring-indigo-500" placeholder="/backups/production" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Username</label>
                                <input type="text" value={newLocation.accessKey || ''} onChange={e => setNewLocation({ ...newLocation, accessKey: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="backup_user" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">SSH Private Key</label>
                                <textarea rows={5} value={newLocation.secretKey || ''} onChange={e => setNewLocation({ ...newLocation, secretKey: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white font-mono text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
                                {location?.hasSecretKey && <p role="status" className="text-xs text-emerald-400">SSH private key saved. Leave blank to keep it, or paste a new key to replace it.</p>}
                                <p className="text-xs text-slate-400">Restic requires an SSH private key. Password-only authentication is not supported.</p>
                                <p className="text-xs text-slate-400">Use a dedicated key without a key passphrase. When editing, leave this field untouched to keep the saved key.</p>
                            </div>
                        </div>
                    </>
                );

            case 'azure':
                return <div className="space-y-4">
                    {([['path','Container name','fortress-backups'],['region','Repository folder (optional)','laptop'],['accessKey','Storage account name','mystorageaccount'],['secretKey','Storage account key','Paste account key']] as const).map(([field,label,placeholder])=><label key={field} className="block text-sm text-slate-300">{label}<input aria-label={label} type={field==='secretKey'?'password':'text'} value={String(newLocation[field]||'')} onChange={e=>setNewLocation({...newLocation,[field]:e.target.value})} placeholder={placeholder} className="w-full mt-2 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white" /></label>)}
                    {newLocation.hasSecretKey && <p role="status" className="text-xs text-emerald-400">Azure credentials saved. Leave account name and key blank to keep them.</p>}
                    <p className="text-xs text-slate-400">Use Restic for Azure backups. The repository encryption password belongs to the saved backup job and is separate from this storage account key.</p>
                </div>;

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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            case 'gcs':
                return <div className="space-y-4">
                    <p className="text-sm text-indigo-200">Backup engine: <strong>Restic</strong> — native Google Cloud Storage.</p>
                    <label className="block text-sm text-slate-300">Bucket name<input aria-label="Google Cloud bucket name" value={newLocation.path||''} onChange={e=>setNewLocation({...newLocation,path:e.target.value})} className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" placeholder="my-backup-bucket" /></label>
                    <label className="block text-sm text-slate-300">Repository folder (optional)<input aria-label="Google Cloud repository folder" value={newLocation.region||''} onChange={e=>setNewLocation({...newLocation,region:e.target.value})} className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" placeholder="laptop" /></label>
                    <CloudSignIn key={newLocation.type} provider="gcs" readyId={oauthFlowId} onReady={signedIn} onReset={()=>setOAuthFlowId(null)} />
                    <details className="space-y-3"><summary className="cursor-pointer text-sm text-slate-300">Or use a Google service account key</summary>
                        <label className="block text-sm text-slate-300">Import service account JSON<input aria-label="Import Google service account JSON" type="file" accept=".json" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>16384){setSaveError('Credentials must be 16 KB or smaller');return}const value=await f.text();setOAuthFlowId(null);setNewLocation(current=>current.type==='gcs'?({...current,secretKey:value}):current)}} className="mt-2 block w-full text-sm" /></label>
                        <textarea aria-label="Google service account JSON" rows={4} value={newLocation.secretKey||''} onChange={e=>{setOAuthFlowId(null);setNewLocation({...newLocation,secretKey:e.target.value})}} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-sm" placeholder='{"type":"service_account",...}' />
                    </details>
                    {newLocation.hasSecretKey&&<p role="status" className="text-xs text-emerald-300">Google Cloud credentials saved. Leave blank to keep them.</p>}
                </div>;
            case 'gdrive':
            case 'onedrive':
                return <div className="space-y-4">
                    <p className="text-sm text-indigo-200">Backup engine: <strong>Restic</strong>. Rclone provides the connection to {type==='gdrive'?'Google Drive':'OneDrive'}; Restic creates encrypted backups and snapshots.</p>
                    <label className="block text-sm text-slate-300">Backup folder<input aria-label="Cloud drive backup folder" value={(newLocation.path||'').replace(/^[^:]+:/,'')} onChange={e=>setNewLocation({...newLocation,path:(oauthFlowId?'fortress:':((newLocation.path||'fortress:').match(/^[^:]+:/)?.[0]||'fortress:'))+e.target.value})} className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" placeholder="FortressBackup" /></label>
                    <CloudSignIn key={newLocation.type} provider={type} readyId={oauthFlowId} onReady={signedIn} onReset={()=>setOAuthFlowId(null)} />
                    {newLocation.hasSecretKey&&<p role="status" className="text-xs text-emerald-300">Drive credentials saved. Leave blank to keep them.</p>}
                    <details className="space-y-3"><summary className="cursor-pointer text-sm text-slate-300">Advanced: import an existing Rclone connection</summary>
                        <label className="block text-sm text-slate-300">Rclone remote and folder<input aria-label="Rclone remote and folder" value={newLocation.path||''} onChange={e=>{setOAuthFlowId(null);setNewLocation({...newLocation,path:e.target.value})}} className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" placeholder="myremote:/backup-folder" /></label>
                        <label className="block text-sm text-slate-300">Import Rclone config<input aria-label="Import Rclone config" type="file" accept=".conf,.ini,.txt" className="block mt-2 w-full text-sm" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>16384){setSaveError('Rclone config must be 16 KB or smaller');return}const value=await f.text();setOAuthFlowId(null);setNewLocation(current=>current.type===type?({...current,secretKey:value}):current);setSaveError('')}} /></label>
                        <label className="block text-sm text-slate-300">Or paste Rclone config<textarea aria-label="Rclone config" rows={4} value={newLocation.secretKey||''} onChange={e=>{setOAuthFlowId(null);setNewLocation({...newLocation,secretKey:e.target.value})}} className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-sm" placeholder="[myremote]&#10;type = drive&#10;token = ..." /></label>
                    </details>
                </div>;

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
            <div role="dialog" aria-modal="true" aria-label="Storage location" className="bg-slate-900 border border-slate-700 rounded-[2rem] w-full max-w-2xl max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 duration-300">
                <div className="p-4 sm:p-6 shrink-0 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="text-xl font-black text-white">
                        {location ? 'Edit Location' : 'Add Storage Location'}
                    </h3>
                    <button onClick={onClose} aria-label="Close dialog" className="p-3 shrink-0 text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-4 sm:p-6 min-h-0 min-w-0 overflow-y-auto flex-1 space-y-6">
                    {/* Location Type Selection */}
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2 block mb-3">Storage Type</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {LOCATION_TYPES.slice(0, 4).map(type => {
                                const TypeIcon = type.icon;
                                return (
                                    <button
                                        key={type.id}
                                        onClick={() => {if(newLocation.type!==type.id){setOAuthFlowId(null);setNewLocation({name:newLocation.name,type:type.id as Location['type'],path:'',endpoint:'',region:'',accessKey:'',secretKey:'',hasAccessKey:false,hasSecretKey:false})}}}
                                        className={`p-3 rounded-xl border text-center transition-all ${newLocation.type === type.id ? `${type.color} border-current` : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}
                                    >
                                        <TypeIcon size={20} className="mx-auto mb-2" />
                                        <span className="text-[10px] font-bold uppercase block">{type.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                            {LOCATION_TYPES.slice(4).map(type => {
                                const TypeIcon = type.icon;
                                return (
                                    <button
                                        key={type.id}
                                        title="Restic backup destination"
                                        onClick={() => {if(newLocation.type!==type.id){setOAuthFlowId(null);setNewLocation({name:newLocation.name,type:type.id as Location['type'],path:'',endpoint:'',region:'',accessKey:'',secretKey:'',hasAccessKey:false,hasSecretKey:false})}}}
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

                <div className="p-4 sm:p-6 shrink-0 border-t border-slate-800 flex flex-wrap justify-end gap-4 bg-slate-800/20">
                    {saveError && <p role="alert" className="basis-full break-words text-sm text-rose-400">{saveError}</p>}
                    <button onClick={onClose} disabled={isSaving} className="px-6 py-3 text-slate-400 hover:text-white font-bold transition-colors disabled:opacity-50">Cancel</button>
                    <button
                        onClick={handleSubmit}
                        disabled={!canSave || isSaving}
                        className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
                    >
                        {isSaving ? 'Saving...' : location ? 'Update Location' : 'Add Location'}
                    </button>
                </div>
            </div>
        </div>
    );
};
