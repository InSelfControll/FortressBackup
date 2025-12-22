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
  <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 hover:border-slate-600 transition-colors">
    <div className="flex items-center justify-between mb-4">
      <div className={`p-3 rounded-lg ${color} bg-opacity-20`}>
        <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
      </div>
      <span className="text-xs font-medium text-slate-400 bg-slate-900 px-2 py-1 rounded-full">+2.5%</span>
    </div>
    <h3 className="text-slate-400 text-sm font-medium">{title}</h3>
    <div className="flex items-baseline mt-1">
      <h2 className="text-2xl font-bold text-white">{value}</h2>
      <span className="ml-2 text-xs text-slate-500">{subtext}</span>
    </div>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ jobs }) => {
  const activeJobs = jobs.filter(j => j.status === JobStatus.RUNNING).length;
  const failedJobs = jobs.filter(j => j.status === JobStatus.FAILED).length;
  const totalJobs = jobs.length;

  const statusData = [
    { name: 'Success', value: jobs.filter(j => j.status === JobStatus.SUCCESS).length, color: '#10b981' }, // emerald-500
    { name: 'Failed', value: jobs.filter(j => j.status === JobStatus.FAILED).length, color: '#f43f5e' }, // rose-500
    { name: 'Running', value: jobs.filter(j => j.status === JobStatus.RUNNING).length, color: '#3b82f6' }, // blue-500
    { name: 'Idle', value: jobs.filter(j => j.status === JobStatus.IDLE).length, color: '#64748b' }, // slate-500
    { name: 'Warning', value: jobs.filter(j => j.status === JobStatus.WARNING).length, color: '#f59e0b' }, // amber-500
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6 animate-fade-in">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Storage Growth</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorStored" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value/1000}TB`} />
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                  itemStyle={{ color: '#cbd5e1' }}
                />
                <Area type="monotone" dataKey="stored" stroke="#6366f1" fillOpacity={1} fill="url(#colorStored)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 flex flex-col">
          <h3 className="text-lg font-semibold text-white mb-6">Job Status</h3>
          <div className="flex-1 min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                    >
                        {statusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0)" />
                        ))}
                    </Pie>
                    <RechartsTooltip 
                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                        itemStyle={{ color: '#cbd5e1' }}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Recent Activity</h3>
          <div className="space-y-4">
            {jobs.slice(0, 5).map((job) => (
              <div key={job.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-700/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    job.status === JobStatus.SUCCESS ? 'bg-emerald-400' :
                    job.status === JobStatus.FAILED ? 'bg-rose-400' : 
                    job.status === JobStatus.RUNNING ? 'bg-blue-400 animate-pulse' : 'bg-slate-500'
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-slate-200">{job.name}</p>
                    <p className="text-xs text-slate-500">{job.tool} • {job.lastRun || 'Never'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-slate-300">{job.size || '0 B'}</p>
                  <p className="text-[10px] text-slate-500 uppercase">{job.status}</p>
                </div>
              </div>
            ))}
          </div>
      </div>
    </div>
  );
};