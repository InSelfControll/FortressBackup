import React, { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { BackupJob, JobStatus, System } from '../types';
import { Activity, Server, HardDrive, AlertCircle, Play, Clock, AlertTriangle, CheckCircle2, Zap } from 'lucide-react';

interface DashboardProps {
  jobs: BackupJob[];
  systems?: System[];
}

const StatCard = ({ title, value, subtext, icon: Icon, color, trend }: any) => (
  <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-2xl p-6 hover:border-indigo-500/30 transition-all duration-300 group">
    <div className="flex items-center justify-between mb-5">
      <div className={`p-3.5 rounded-xl ${color} bg-opacity-10 border border-slate-800 group-hover:scale-110 transition-transform`}>
        <Icon className={`w-5 h-5 ${color.replace('bg-', 'text-')}`} />
      </div>
      {trend && (
        <span className={`text-[10px] font-black px-2 py-1 rounded-md border ${trend > 0 ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' : trend < 0 ? 'text-rose-500 bg-rose-500/10 border-rose-500/20' : 'text-slate-500 bg-slate-950/80 border-slate-800'}`}>
          {trend > 0 ? '+' : ''}{trend}%
        </span>
      )}
    </div>
    <h3 className="text-slate-500 text-[11px] font-black uppercase tracking-widest">{title}</h3>
    <div className="flex items-baseline mt-2">
      <h2 className="text-3xl font-black text-white tracking-tight">{value}</h2>
      <span className="ml-3 text-[10px] font-bold text-slate-600 uppercase tracking-tighter">{subtext}</span>
    </div>
  </div>
);

const QuickActionCard = ({ title, description, icon: Icon, onClick, color }: any) => (
  <button
    onClick={onClick}
    className={`p-4 rounded-xl border ${color} transition-all hover:scale-[1.02] active:scale-[0.98] text-left flex items-start gap-4`}
  >
    <div className="p-2 rounded-lg bg-slate-900/50">
      <Icon size={20} />
    </div>
    <div>
      <h4 className="font-bold text-white text-sm">{title}</h4>
      <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">{description}</p>
    </div>
  </button>
);

export const Dashboard: React.FC<DashboardProps> = ({ jobs, systems = [] }) => {
  const activeJobs = jobs.filter(j => j.status === JobStatus.RUNNING).length;
  const failedJobs = jobs.filter(j => j.status === JobStatus.FAILED).length;
  const successfulJobs = jobs.filter(j => j.status === JobStatus.SUCCESS).length;
  const totalJobs = jobs.length;

  // Calculate system health
  const avgSystemHealth = useMemo(() => {
    if (systems.length === 0) return 0;
    const total = systems.reduce((sum, s) => sum + s.health, 0);
    return Math.round(total / systems.length);
  }, [systems]);

  const onlineSystems = systems.filter(s => s.status === 'online').length;

  // Mock storage data - in production this would come from actual backup stats
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
    { name: 'Success', value: successfulJobs, color: '#10b981' },
    { name: 'Failed', value: failedJobs, color: '#f43f5e' },
    { name: 'Running', value: activeJobs, color: '#6366f1' },
    { name: 'Idle', value: jobs.filter(j => j.status === JobStatus.IDLE).length, color: '#64748b' },
  ].filter(d => d.value > 0);

  // Calculate efficiency (success rate)
  const efficiency = totalJobs > 0
    ? Math.round(((successfulJobs + jobs.filter(j => j.status === JobStatus.IDLE).length) / totalJobs) * 100)
    : 100;

  return (
    <div className="space-y-8 animate-fade-in relative z-10">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Jobs"
          value={totalJobs.toString()}
          subtext={`${activeJobs} running`}
          icon={HardDrive}
          color="bg-indigo-500 text-indigo-400"
          trend={null}
        />
        <StatCard
          title="Active Streams"
          value={activeJobs.toString()}
          subtext={totalJobs > 0 ? `of ${totalJobs} total` : 'No jobs'}
          icon={Activity}
          color="bg-blue-500 text-blue-400"
          trend={null}
        />
        <StatCard
          title="System Health"
          value={systems.length > 0 ? `${avgSystemHealth}%` : 'N/A'}
          subtext={`${onlineSystems}/${systems.length} online`}
          icon={Server}
          color="bg-emerald-500 text-emerald-400"
          trend={avgSystemHealth > 90 ? 2.5 : avgSystemHealth > 70 ? 0 : -5}
        />
        <StatCard
          title="Critical Alerts"
          value={failedJobs.toString()}
          subtext={failedJobs > 0 ? 'Requires attention' : 'All systems nominal'}
          icon={AlertCircle}
          color="bg-rose-500 text-rose-400"
          trend={null}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-[2.5rem] p-8">
          <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-8">Storage Growth</h3>
          <div className="h-80 w-full relative min-h-[320px]">
            <div className="absolute inset-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100} debounce={200}>
                <AreaChart data={storageData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorStored" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="#475569" fontSize={10} fontWeight="900" tickLine={false} axisLine={false} tickMargin={15} />
                  <YAxis stroke="#475569" fontSize={10} fontWeight="900" tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}TB`} />
                  <CartesianGrid strokeDasharray="5 5" stroke="#1e293b" vertical={false} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid #1e293b', padding: '12px' }}
                    itemStyle={{ color: '#6366f1', fontSize: '12px', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="stored" stroke="#6366f1" strokeWidth={4} fillOpacity={1} fill="url(#colorStored)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-[2.5rem] p-8 flex flex-col">
          <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-8">Job Status</h3>
          <div className="flex-1 min-h-[250px] relative">
            <div className="absolute inset-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100} debounce={200}>
                <PieChart>
                  <Pie
                    data={statusData.length > 0 ? statusData : [{ name: 'No Jobs', value: 1, color: '#1e293b' }]}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={95}
                    paddingAngle={statusData.length > 1 ? 10 : 0}
                    dataKey="value"
                    cornerRadius={12}
                  >
                    {(statusData.length > 0 ? statusData : [{ name: 'No Jobs', value: 1, color: '#1e293b' }]).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid #1e293b' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Efficiency</span>
                <span className="text-2xl font-black text-white">{efficiency}%</span>
              </div>
            </div>
          </div>

          {/* Status Legend */}
          <div className="grid grid-cols-2 gap-2 mt-4">
            {statusData.map(item => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-[10px] text-slate-400 font-bold uppercase">{item.name}: {item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Quick Actions */}
        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-[2.5rem] p-8">
          <div className="flex items-center gap-3 mb-6">
            <Zap className="text-amber-400" size={20} />
            <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Quick Actions</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <QuickActionCard
              title="Run All Scheduled"
              description="Execute pending jobs"
              icon={Play}
              color="bg-indigo-500/5 border-indigo-500/20 hover:bg-indigo-500/10"
              onClick={() => { }}
            />
            <QuickActionCard
              title="Check System Health"
              description="Scan all nodes"
              icon={Server}
              color="bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10"
              onClick={() => { }}
            />
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-[2.5rem] p-8">
          <div className="flex items-center gap-3 mb-6">
            <AlertTriangle className="text-amber-400" size={20} />
            <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Active Alerts</h3>
          </div>
          <div className="space-y-3">
            {failedJobs > 0 && (
              <div className="flex items-center gap-4 p-4 rounded-xl bg-rose-500/5 border border-rose-500/20">
                <AlertCircle className="text-rose-400" size={20} />
                <div>
                  <p className="text-sm font-bold text-rose-400">{failedJobs} Failed Job{failedJobs > 1 ? 's' : ''}</p>
                  <p className="text-[10px] text-slate-500 uppercase">Requires immediate attention</p>
                </div>
              </div>
            )}
            {systems.filter(s => s.status === 'offline').length > 0 && (
              <div className="flex items-center gap-4 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <Server className="text-amber-400" size={20} />
                <div>
                  <p className="text-sm font-bold text-amber-400">{systems.filter(s => s.status === 'offline').length} System{systems.filter(s => s.status === 'offline').length > 1 ? 's' : ''} Offline</p>
                  <p className="text-[10px] text-slate-500 uppercase">Connection issues detected</p>
                </div>
              </div>
            )}
            {failedJobs === 0 && systems.filter(s => s.status === 'offline').length === 0 && (
              <div className="flex items-center gap-4 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <CheckCircle2 className="text-emerald-400" size={20} />
                <div>
                  <p className="text-sm font-bold text-emerald-400">All Systems Nominal</p>
                  <p className="text-[10px] text-slate-500 uppercase">No issues detected</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-[2.5rem] p-8">
        <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-6">Recent Activity</h3>
        <div className="space-y-4">
          {jobs.length === 0 ? (
            <p className="text-slate-600 text-[11px] font-black uppercase tracking-widest text-center py-10">Waiting for first stream ingestion...</p>
          ) : (
            jobs.slice(0, 5).map((job) => (
              <div key={job.id} className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-800/40 transition-all border border-transparent hover:border-slate-800">
                <div className="flex items-center gap-4">
                  <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_10px_currentColor] ${job.status === JobStatus.SUCCESS ? 'text-emerald-400 bg-emerald-400' :
                    job.status === JobStatus.FAILED ? 'text-rose-400 bg-rose-400' :
                      job.status === JobStatus.RUNNING ? 'text-blue-400 bg-blue-400 animate-pulse' : 'text-slate-600 bg-slate-600'
                    }`} />
                  <div>
                    <p className="text-sm font-black text-slate-100">{job.name}</p>
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-0.5">{job.tool} • {job.lastRun || 'INITIALIZING'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-slate-300">{job.size || '0 B'}</p>
                  <p className={`text-[9px] font-black uppercase tracking-tighter ${job.status === JobStatus.SUCCESS ? 'text-emerald-500' : job.status === JobStatus.FAILED ? 'text-rose-500' : 'text-slate-500'}`}>{job.status}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
