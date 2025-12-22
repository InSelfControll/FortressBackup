
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell, Legend 
} from 'recharts';
import { BackupJob, JobStatus } from '../types';
import { Activity, Server, HardDrive, AlertCircle, CheckCircle2 } from 'lucide-react';

interface DashboardProps {
  jobs: BackupJob[];
}

const data = [
  { name: 'Mon', stored: 4000, transferred: 2400 },
  { name: 'Tue', stored: 4200, transferred: 1398 },
  { name: 'Wed', stored: 4400, transferred: 9800 },
  { name: 'Thu', stored: 4450, transferred: 3908 },
  { name: 'Fri', stored: 4600, transferred: 4800 },
  { name: 'Sat', stored: 4800, transferred: 3800 },
  { name: 'Sun', stored: 4900, transferred: 4300 },
];

const StatCard = ({ title, value, subtext, icon: Icon, color }: any) => (
  <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-2xl p-6 hover:border-indigo-500/30 transition-all duration-300 group">
    <div className="flex items-center justify-between mb-5">
      <div className={`p-3.5 rounded-xl ${color} bg-opacity-10 border border-slate-800 group-hover:scale-110 transition-transform`}>
        <Icon className={`w-5 h-5 ${color.replace('bg-', 'text-')}`} />
      </div>
      <span className="text-[10px] font-black text-slate-500 bg-slate-950/80 px-2 py-1 rounded-md border border-slate-800">+2.5%</span>
    </div>
    <h3 className="text-slate-500 text-[11px] font-black uppercase tracking-widest">{title}</h3>
    <div className="flex items-baseline mt-2">
      <h2 className="text-3xl font-black text-white tracking-tight">{value}</h2>
      <span className="ml-3 text-[10px] font-bold text-slate-600 uppercase tracking-tighter">{subtext}</span>
    </div>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ jobs }) => {
  const activeJobs = jobs.filter(j => j.status === JobStatus.RUNNING).length;
  const failedJobs = jobs.filter(j => j.status === JobStatus.FAILED).length;
  const totalJobs = jobs.length;

  const statusData = [
    { name: 'Success', value: jobs.filter(j => j.status === JobStatus.SUCCESS).length, color: '#10b981' }, 
    { name: 'Failed', value: jobs.filter(j => j.status === JobStatus.FAILED).length, color: '#f43f5e' }, 
    { name: 'Running', value: jobs.filter(j => j.status === JobStatus.RUNNING).length, color: '#6366f1' }, 
    { name: 'Idle', value: jobs.filter(j => j.status === JobStatus.IDLE).length, color: '#64748b' }, 
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-8 animate-fade-in relative z-10">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Storage" 
          value="12.4 TB" 
          subtext="Used of 50 TB" 
          icon={HardDrive} 
          color="bg-indigo-500 text-indigo-400" 
        />
        <StatCard 
          title="Active Jobs" 
          value={activeJobs.toString()} 
          subtext={`out of ${totalJobs} total`} 
          icon={Activity} 
          color="bg-blue-500 text-blue-400" 
        />
        <StatCard 
          title="Healthy Systems" 
          value="98.2%" 
          subtext="Uptime average" 
          icon={Server} 
          color="bg-emerald-500 text-emerald-400" 
        />
        <StatCard 
          title="Critical Alerts" 
          value={failedJobs.toString()} 
          subtext="Requires attention" 
          icon={AlertCircle} 
          color="bg-rose-500 text-rose-400" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-[2.5rem] p-8">
          <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-8">Storage Growth</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorStored" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#475569" fontSize={10} fontWeight="900" tickLine={false} axisLine={false} tickMargin={15} />
                <YAxis stroke="#475569" fontSize={10} fontWeight="900" tickLine={false} axisLine={false} tickFormatter={(v) => `${v/1000}TB`} />
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

        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-[2.5rem] p-8 flex flex-col">
          <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-8">Job Status</h3>
          <div className="flex-1 min-h-[250px] relative">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={statusData.length > 0 ? statusData : [{name: 'Idle', value: 1, color: '#1e293b'}]}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={95}
                        paddingAngle={10}
                        dataKey="value"
                        cornerRadius={12}
                    >
                        {statusData.map((entry, index) => (
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
              <span className="text-2xl font-black text-white">99%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-[2.5rem] p-8">
          <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-6">Recent Activity</h3>
          <div className="space-y-4">
            {jobs.length === 0 ? (
               <p className="text-slate-600 text-[11px] font-black uppercase tracking-widest text-center py-10">Waiting for first stream ingestion...</p>
            ) : (
              jobs.slice(0, 5).map((job) => (
                <div key={job.id} className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-800/40 transition-all border border-transparent hover:border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_10px_currentColor] ${
                      job.status === JobStatus.SUCCESS ? 'text-emerald-400 bg-emerald-400' :
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
                    <p className={`text-[9px] font-black uppercase tracking-tighter ${job.status === JobStatus.SUCCESS ? 'text-emerald-500' : 'text-slate-500'}`}>{job.status}</p>
                  </div>
                </div>
              ))
            )}
          </div>
      </div>
    </div>
  );
};
