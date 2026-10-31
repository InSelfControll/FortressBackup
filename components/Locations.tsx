import { testLocation } from '../client/api/resources';
import { requireData } from '../client/api/client';
import { QueryStatus } from './QueryStatus';
import React, { useState } from 'react';
import { Location } from '../types';
import { HardDrive, Plus } from 'lucide-react';
import { useLocations } from '../client/api/queries';
import { useDeleteLocation } from '../client/api/mutations';
import { toast } from 'react-hot-toast';
import { LocationCard } from './locations/LocationCard';
import { LocationModal } from './locations/LocationModal';

interface LocationsProps { searchQuery?: string }

export const Locations: React.FC<LocationsProps> = ({ searchQuery = '' }) => {
  const locationsQuery = useLocations();
  const { data: locations = [] } = locationsQuery;
  const deleteLocationMutation = useDeleteLocation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [connectionResults, setConnectionResults] = useState<Record<string, 'success' | 'failed'>>({});

  const openCreateModal = () => {
    setEditingLocation(null);
    setIsModalOpen(true);
  };

  const openEditModal = (loc: Location) => {
    setEditingLocation(loc);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    deleteLocationMutation.mutate(id, {
      onSuccess: () => toast.success('Location deleted')
    });
    setDeleteConfirm(null);
  };

  const testConnection = async (loc: Location) => {
    if (testingConnection) return;
    setTestingConnection(loc.id);
    try {
      const result = requireData(await testLocation(loc.id));
      setConnectionResults(prev => ({ ...prev, [loc.id]: 'success' }));
      toast.success(result.message);
    } catch (error) {
      setConnectionResults(prev => ({ ...prev, [loc.id]: 'failed' }));
      toast.error(error instanceof Error ? error.message : 'Connection check failed');
    } finally { setTestingConnection(null); }
  };

  return (
    <div className="space-y-8">
      <QueryStatus pending={locationsQuery.isPending} error={locationsQuery.error} retry={() => void locationsQuery.refetch()} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Storage Registry</h2>
          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">Backup Destination Endpoints</p>
        </div>
        <button onClick={openCreateModal} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-black text-sm shadow-lg shadow-indigo-500/20 transition-all active:scale-95">
          <Plus size={18} /> Add Location
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
        {!locationsQuery.isPending && !locationsQuery.error && locations.length === 0 && (
          <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-800 rounded-[2rem] bg-slate-800/20">
            <HardDrive size={48} className="mx-auto text-slate-700 mb-4" />
            <h3 className="text-lg font-bold text-slate-400">No Storage Locations</h3>
            <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">Add your first backup destination to start protecting your data.</p>
          </div>
        )}
        {locations.filter(location => `${location.name} ${location.path}`.toLowerCase().includes(searchQuery.toLowerCase())).map((loc) => (
          <LocationCard
            key={loc.id}
            location={loc}
            onEdit={openEditModal}
            onDelete={handleDelete}
            onTestConnection={testConnection}
            isTesting={testingConnection === loc.id}
            connectionResult={connectionResults[loc.id]}
            isDeleteConfirm={deleteConfirm === loc.id}
            setDeleteConfirm={setDeleteConfirm}
          />
        ))}
      </div>

      {isModalOpen && (
        <LocationModal
          location={editingLocation}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
};
