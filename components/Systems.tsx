import React, { useState } from 'react';
import { System } from '../types';
import { useSystems, useJobs, useSSHKeys } from '../client/api/queries';
import { useDeleteSystem } from '../client/api/mutations';
import { toast } from 'react-hot-toast';
import { Server, Plus, Key } from 'lucide-react';
import { SystemCard } from './systems/SystemCard';
import { DeploymentTerminal } from './systems/DeploymentTerminal';
import { AddSystemModal } from './systems/AddSystemModal';
import { EditSystemModal } from './systems/EditSystemModal';
import { SSHKeyManager } from './systems/SSHKeyManager';

interface SystemsProps { }

export const Systems: React.FC<SystemsProps> = () => {
  const { data: systems = [] } = useSystems();
  const { data: sshKeys = [] } = useSSHKeys();
  const deleteSystemMutation = useDeleteSystem();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSystem, setEditingSystem] = useState<System | null>(null);
  const [isKeyManagerOpen, setIsKeyManagerOpen] = useState(false);
  const [deployingSystem, setDeployingSystem] = useState<System | null>(null);

  const handleDeploy = (system: System) => {
    setDeployingSystem(system);
  };

  const finalizeDeployment = () => {
    toast.success('System updated with installed tools');
  };

  const handleEditSystem = (system: System) => {
    setEditingSystem(system);
    setIsEditModalOpen(true);
  };

  const handleDeleteSystem = (id: string) => {
    deleteSystemMutation.mutate(id, {
      onSuccess: () => toast.success('System deleted')
    });
  };

  const handleEditModalClose = () => {
    setIsEditModalOpen(false);
    setEditingSystem(null);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">System Infrastructure</h2>
          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">Managed Nodes Cluster</p>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setIsKeyManagerOpen(true)} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-6 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 shadow-sm">
            <Key size={18} /> Identity Vault ({sshKeys.length})
          </button>
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-black text-sm shadow-lg shadow-indigo-500/20 transition-all active:scale-95">
            <Plus size={18} /> Register Node
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {systems.length === 0 && (
          <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-800 rounded-[2rem] bg-slate-800/20">
            <Server size={48} className="mx-auto text-slate-700 mb-4" />
            <h3 className="text-lg font-bold text-slate-400">No Systems Registered</h3>
            <p className="text-slate-500 text-sm mt-2">Add your first managed node to begin orchestration.</p>
          </div>
        )}
        {systems.map((system) => (
          <SystemCard
            key={system.id}
            system={system}
            onEdit={handleEditSystem}
            onDelete={handleDeleteSystem}
            onDeploy={handleDeploy}
          />
        ))}
      </div>

      {deployingSystem && (
        <DeploymentTerminal
          system={deployingSystem}
          sshKeys={sshKeys}
          onClose={() => setDeployingSystem(null)}
          onComplete={finalizeDeployment}
        />
      )}

      <AddSystemModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        sshKeys={sshKeys}
      />

      {editingSystem && (
        <EditSystemModal
          isOpen={isEditModalOpen}
          onClose={handleEditModalClose}
          system={editingSystem}
          sshKeys={sshKeys}
        />
      )}

      <SSHKeyManager
        isOpen={isKeyManagerOpen}
        onClose={() => setIsKeyManagerOpen(false)}
        sshKeys={sshKeys}
      />
    </div>
  );
};
