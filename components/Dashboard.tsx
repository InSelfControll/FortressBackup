import React, { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { BackupJob, JobStatus, System } from '../types';
import { Activity, Server, HardDrive, AlertCircle, Play, Clock, AlertTriangle, CheckCircle2, Zap } from 'lucide-react';

import { useJobs, useSystems } from '../client/api/queries';

interface DashboardProps { }

const StatCard = ({ title, value, subtext, icon: Icon, color }: any) => (
  <div className="card" style={{ border: '1px solid var(--color-border-subtle)' }}>
    <div className="flex items-center justify-between mb-4">
      <div className="p-2.5 rounded-lg" style={{ backgroundColor: `${color}20` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
    </div>
    <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>{title}</p>
    <div className="flex items-baseline gap-2">
      <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{value}</h2>
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{subtext}</span>
    </div>
  </div>
);

const QuickActionCard = ({ title, description, icon: Icon, onClick, color }: any) => (
  <button
    onClick={onClick}
    className="p-4 rounded-lg transition-all hover:opacity-90 text-left flex items-start gap-3"
    style={{ backgroundColor: `${color}10`, border: `1px solid ${color}30` }}
  >
    <div className="p-2 rounded-md" style={{ backgroundColor: `${color}20` }}>
      <Icon size={18} style={{ color }} />
    </div>
    <div>
      <h4 className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>{title}</h4>
      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{description}</p>
    </div>
  </button>
);

export const Dashboard: React.FC<DashboardProps> = () => {
  const { data: jobs = [] } = useJobs();
  const { data: systems = [] } = useSystems();
  const activeJobs = jobs.filter(j => j.status === JobStatus.RUNNING).length;
  const failedJobs = jobs.filter(j => j.status === JobStatus.FAILED).length;
  const successfulJobs = jobs.filter(j => j.status === JobStatus.SUCCESS).length;
  const totalJobs = jobs.length;

  const avgSystemHealth = useMemo(() => {
    if (systems.length === 0) return 0;
    const total = systems.reduce((sum, s) => sum + s.health, 0);
    return Math.round(total / systems.length);
  }, [systems]);

  const onlineSystems = systems.filter(s => s.status === 'online').length;

  const storageData = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const baseStorage = 4000;
    return days.map((name, i) => ({
      name,
      stored: baseStorage + (i * 150) + Math.floor(Math.random() * 200),
      transferred: 1000 + Math.floor(Math.random() * 3000)
    }));
  }, []);

  const statusData = [
    { name: 'Success', value: successfulJobs, color: 'var(--color-success)' },
    { name: 'Failed', value: failedJobs, color: 'var(--color-error)' },
    { name: 'Running', value: activeJobs, color: 'var(--color-accent-primary)' },
    { name: 'Idle', value: jobs.filter(j => j.status === JobStatus.IDLE).length, color: 'var(--color-text-muted)' },
  ].filter(d => d.value > 0);

  const efficiency = totalJobs > 0
    ? Math.round(((successfulJobs + jobs.filter(j => j.status === JobStatus.IDLE).length) / totalJobs) * 100)
    : 100;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Jobs" value={totalJobs.toString()} subtext={`${activeJobs} running`} icon={HardDrive} color="#6366f1" />
        <StatCard title="Active Jobs" value={activeJobs.toString()} subtext={totalJobs > 0 ? `of ${totalJobs}` : 'No jobs'} icon={Activity} color="#3b82f6" />
        <StatCard title="System Health" value={systems.length > 0 ? `${avgSystemHealth}%` : 'N/A'} subtext={`${onlineSystems}/${systems.length} online`} icon={Server} color="#22c55e" />
        <StatCard title="Failed Jobs" value={failedJobs.toString()} subtext={failedJobs > 0 ? 'Needs attention' : 'All good'} icon={AlertCircle} color="#ef4444" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Storage Chart */}
        <div className="lg:col-span-2 card">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>Storage Growth</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%" debounce={200}>
              <AreaChart data={storageData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorStored" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-accent-primary)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-accent-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}TB`} />
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
                <RechartsTooltip contentStyle={{ backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px', border: '1px solid var(--color-border-default)' }} />
                <Area type="monotone" dataKey="stored" stroke="var(--color-accent-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorStored)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="card flex flex-col">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>Job Status</h3>
          <div className="flex-1 min-h-[200px] relative">
            <ResponsiveContainer width="100%" height="100%" debounce={200}>
              <PieChart>
                <Pie data={statusData.length > 0 ? statusData : [{ name: 'No Jobs', value: 1, color: 'var(--color-border-default)' }]} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={statusData.length > 1 ? 4 : 0} dataKey="value" cornerRadius={4}>
                  {(statusData.length > 0 ? statusData : [{ name: 'No Jobs', value: 1, color: 'var(--color-border-default)' }]).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Efficiency</span>
              <span className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{efficiency}%</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
            {statusData.map(item => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{item.name}: {item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={16} style={{ color: 'var(--color-warning)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Quick Actions</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <QuickActionCard title="Run All Scheduled" description="Execute pending jobs" icon={Play} color="#6366f1" onClick={() => { }} />
            <QuickActionCard title="Check Health" description="Scan all systems" icon={Server} color="#22c55e" onClick={() => { }} />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} style={{ color: 'var(--color-warning)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Alerts</h3>
          </div>
          <div className="space-y-2">
            {failedJobs > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <AlertCircle size={16} style={{ color: 'var(--color-error)' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-error)' }}>{failedJobs} Failed Job{failedJobs > 1 ? 's' : ''}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Requires attention</p>
                </div>
              </div>
            )}
            {systems.filter(s => s.status === 'offline').length > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                <Server size={16} style={{ color: 'var(--color-warning)' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-warning)' }}>{systems.filter(s => s.status === 'offline').length} System{systems.filter(s => s.status === 'offline').length > 1 ? 's' : ''} Offline</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Connection issues</p>
                </div>
              </div>
            )}
            {failedJobs === 0 && systems.filter(s => s.status === 'offline').length === 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                <CheckCircle2 size={16} style={{ color: 'var(--color-success)' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>All Systems Nominal</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>No issues detected</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>Recent Activity</h3>
        <div className="space-y-2">
          {jobs.length === 0 ? (
            <p className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>No backup jobs yet. Create your first job to get started.</p>
          ) : (
            jobs.slice(0, 5).map((job) => (
              <div key={job.id} className="flex items-center justify-between p-3 rounded-lg transition-colors" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${job.status === JobStatus.RUNNING ? 'animate-pulse' : ''}`}
                    style={{ backgroundColor: job.status === JobStatus.SUCCESS ? 'var(--color-success)' : job.status === JobStatus.FAILED ? 'var(--color-error)' : job.status === JobStatus.RUNNING ? 'var(--color-info)' : 'var(--color-text-muted)' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{job.name}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{job.tool} • {job.lastRun || 'Never run'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{job.size || '0 B'}</p>
                  <p className="text-xs capitalize" style={{ color: job.status === JobStatus.SUCCESS ? 'var(--color-success)' : job.status === JobStatus.FAILED ? 'var(--color-error)' : 'var(--color-text-muted)' }}>{job.status}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
