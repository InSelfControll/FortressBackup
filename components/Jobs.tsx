import { QueryStatus } from './QueryStatus';
import React, { useState, useMemo } from 'react';
import { BackupJob, JobStatus, BackupTool, AIConfig } from '../types';
import { Archive, Plus, Filter, Search } from 'lucide-react';
import { RestoreModal } from './RestoreModal';
import { useJobs, useSystems, useLocations } from '../client/api/queries';
import { useDeleteJob, useRunJob } from '../client/api/mutations';
import { toast } from 'react-hot-toast';
import { JobCard } from './jobs/JobCard';
import { JobModal } from './jobs/JobModal';
import { JobLogs } from './jobs/JobLogs';

interface JobsProps {
  aiConfig: AIConfig;
  searchQuery?: string;
}

export const Jobs: React.FC<JobsProps> = ({ aiConfig, searchQuery: globalSearch = '' }) => {
  const jobsQuery = useJobs();
  const { data: jobs = [] } = jobsQuery;
  const systemsQuery = useSystems();
  const { data: systems = [] } = systemsQuery;
  const locationsQuery = useLocations();
  const { data: locations = [] } = locationsQuery;

  const deleteJobMutation = useDeleteJob();
  const runJobMutation = useRunJob();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<BackupJob | null>(null);
  const [selectedJob, setSelectedJob] = useState<BackupJob | null>(null);

  // Restore State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreJob, setRestoreJob] = useState<BackupJob | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');
  const [toolFilter, setToolFilter] = useState<BackupTool | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const matchesSearch = job.name.toLowerCase().includes(searchQuery.toLowerCase()) && job.name.toLowerCase().includes(globalSearch.toLowerCase());
      const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
      const matchesTool = toolFilter === 'all' || job.tool === toolFilter;
      return matchesSearch && matchesStatus && matchesTool;
    });
  }, [jobs, searchQuery, globalSearch, statusFilter, toolFilter]);

  const openCreateModal = () => {
    setEditingJob(null);
    setIsModalOpen(true);
  };

  const openEditModal = (job: BackupJob) => {
    setEditingJob(job);
    setIsModalOpen(true);
  };

  const openRestoreModal = (job: BackupJob) => {
    setRestoreJob(job);
    setIsRestoreModalOpen(true);
  };

  const handleDeleteJob = (id: string) => {
    deleteJobMutation.mutate(id, {
      onSuccess: () => toast.success('Job deleted')
    });
  };

  const handleRunJob = (id: string) => {
    runJobMutation.mutate(id);
  };

  const getSystemName = (id: string) => systems.find(s => s.id === id)?.name || 'Unknown';
  const getLocationName = (id: string) => locations.find(l => l.id === id)?.name || 'Unknown';

  return (
    <div className="space-y-6">
      <QueryStatus pending={jobsQuery.isPending} error={jobsQuery.error} retry={() => void jobsQuery.refetch()} />
      <QueryStatus pending={systemsQuery.isPending} error={systemsQuery.error} retry={() => void systemsQuery.refetch()} />
      <QueryStatus pending={locationsQuery.isPending} error={locationsQuery.error} retry={() => void locationsQuery.refetch()} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Backup Streams</h2>
          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">Orchestrated backup jobs</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${showFilters ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'}`}
          >
            <Filter size={16} /> Filters
          </button>
          <button onClick={openCreateModal} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20">
            <Plus size={16} /> Create Job
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      {showFilters && (
        <div className="flex flex-wrap gap-4 p-4 bg-slate-800/40 rounded-2xl border border-slate-700/50 animate-in slide-in-from-top-2 duration-200">
          <div className="flex-1 min-w-0 basis-full sm:basis-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="text"
                placeholder="Search jobs..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white outline-none"
          >
            <option value="all">All Status</option>
            {Object.values(JobStatus).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={toolFilter}
            onChange={e => setToolFilter(e.target.value as any)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white outline-none"
          >
            <option value="all">All Tools</option>
            {Object.values(BackupTool).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {!jobsQuery.isPending && !jobsQuery.error && filteredJobs.length === 0 && (
          <div className="py-12 text-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-800/20">
            <Archive size={48} className="mx-auto text-slate-700 mb-4" />
            <h3 className="text-lg font-medium text-slate-400">
              {jobs.length === 0 ? 'No backup jobs yet' : 'No jobs match your filters'}
            </h3>
            <p className="text-slate-500 text-sm mt-2">
              {jobs.length === 0 ? 'Create your first automated backup orchestration.' : 'Try adjusting your search or filter criteria.'}
            </p>
          </div>
        )}
        {filteredJobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            systemName={getSystemName(job.sourceId)}
            locationName={getLocationName(job.destinationId)}
            onEdit={openEditModal}
            onViewLogs={() => setSelectedJob(job)}
            onRestore={openRestoreModal}
            onRun={handleRunJob}
            onDelete={handleDeleteJob}
            isRunning={job.status === JobStatus.RUNNING}
            isRunPending={runJobMutation.isPending}
          />
        ))}
      </div>

      {restoreJob && (
        <RestoreModal
          job={restoreJob}
          systems={systems}
          isOpen={isRestoreModalOpen}
          onClose={() => { setIsRestoreModalOpen(false); setRestoreJob(null); }}
        />
      )}

      {isModalOpen && (
        <JobModal
          job={editingJob}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          systems={systems}
          locations={locations}
          aiConfig={aiConfig}
        />
      )}

      {selectedJob && (
        <JobLogs
          job={jobs.find(job => job.id === selectedJob.id) || selectedJob}
          onClose={() => setSelectedJob(null)}
          systemName={getSystemName(selectedJob.sourceId)}
          locationName={getLocationName(selectedJob.destinationId)}
        />
      )}
    </div>
  );
};