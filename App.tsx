import React, { useState, useEffect } from 'react';
import { View, User, BackupJob, BackupTool, JobStatus, System, JobPriority, SSHKey, Location, AIConfig, AIProvider } from './types.ts';
import { Login } from './components/Login.tsx';
import { Setup } from './components/Setup.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { Jobs } from './components/Jobs.tsx';
import { Systems } from './components/Systems.tsx';
import { Locations } from './components/Locations.tsx';
import { Layout, LayoutDashboard, Server, HardDrive, Settings, LogOut, ShieldCheck, Search } from 'lucide-react';

const MOCK_USER: User = {
  id: 'u1',
  name: 'Alex DevOps',
  email: 'alex@fortress.io',
  avatar: 'https://picsum.photos/200',
  role: 'admin',
  setupComplete: false
};

const INITIAL_JOBS: BackupJob[] = [
  {
    id: 'j1',
    name: 'Primary DB Hourly',
    tool: BackupTool.BORG,
    sourceId: 'sys-1',
    destinationId: 'loc-1',
    schedule: '0 * * * *',
    retention: { keepHourly: 24, keepDaily: 7, keepWeekly: 4, keepMonthly: 6, keepYearly: 1 },
    priority: JobPriority.HIGH,
    status: JobStatus.SUCCESS,
    lastRun: '1 hour ago',
    nextRun: 'in 55 mins',
    size: '45 GB'
  }
];

const INITIAL_SYSTEMS: System[] = [
  { id: 'sys-1', name: 'DB-Primary-01', host: '10.0.0.50', username: 'root', type: 'local', status: 'online', lastSeen: 'Now', health: 98 },
  { id: 'sys-2', name: 'Web-FE-01', host: '192.168.1.20', username: 'ubuntu', type: 'remote', status: 'online', lastSeen: '5m ago', health: 85 },
];

const INITIAL_LOCATIONS: Location[] = [
  { id: 'loc-1', name: 'AWS S3 West', type: 's3', path: 's3://fortress-backups-us-west-2' },
];

const SSH_KEYS_STORAGE_KEY = 'fortress_vault_ssh_keys_v2';
const SETUP_COMPLETE_KEY = 'fortress_setup_complete_v2';
const AI_CONFIG_KEY = 'fortress_ai_config_v2';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [jobs, setJobs] = useState<BackupJob[]>(INITIAL_JOBS);
  const [systems, setSystems] = useState<System[]>(INITIAL_SYSTEMS);
  const [locations, setLocations] = useState<Location[]>(INITIAL_LOCATIONS);
  const [sshKeys, setSshKeys] = useState<SSHKey[]>([]);
  const [aiConfig, setAiConfig] = useState<AIConfig>({ provider: AIProvider.NONE });

  // Load state on mount
  useEffect(() => {
    const savedKeys = localStorage.getItem(SSH_KEYS_STORAGE_KEY);
    if (savedKeys) {
      try { setSshKeys(JSON.parse(savedKeys)); } catch (e) { console.error(e); }
    }

    const savedAi = localStorage.getItem(AI_CONFIG_KEY);
    if (savedAi) {
      try { setAiConfig(JSON.parse(savedAi)); } catch (e) { console.error(e); }
    }
    
    const setupDone = localStorage.getItem(SETUP_COMPLETE_KEY);
    setIsSetupComplete(setupDone === 'true');
  }, []);

  // Persist SSH Keys
  useEffect(() => {
    localStorage.setItem(SSH_KEYS_STORAGE_KEY, JSON.stringify(sshKeys));
  }, [sshKeys]);

  const handleLogin = () => setIsAuthenticated(true);
  const handleLogout = () => {
    setIsAuthenticated(false);
  };

  const completeSetup = (masterPassword: string, config: AIConfig) => {
    setIsSetupComplete(true);
    setAiConfig(config);
    localStorage.setItem(SETUP_COMPLETE_KEY, 'true');
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
  };

  const addJob = (job: BackupJob) => setJobs([...jobs, job]);
  const deleteJob = (id: string) => setJobs(jobs.filter(j => j.id !== id));
  const runJob = (id: string) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: JobStatus.RUNNING } : j));
    setTimeout(() => {
      setJobs(prev => prev.map(j => j.id === id ? { ...j, status: JobStatus.SUCCESS, lastRun: 'Just now' } : j));
    }, 3000);
  };

  const addSystem = (sys: System) => setSystems([...systems, sys]);
  const addSSHKey = (key: SSHKey) => setSshKeys(prev => [...prev, key]);
  const deleteSSHKey = (id: string) => setSshKeys(prev => prev.filter(k => k.id !== id));
  const updateSSHKeysOrder = (updatedKeys: SSHKey[]) => setSshKeys(updatedKeys);

  const addLocation = (loc: Location) => setLocations([...locations, loc]);
  const deleteLocation = (id: string) => setLocations(locations.filter(l => l.id !== id));

  // Loading state for setup check
  if (isSetupComplete === null) return <div className="min-h-screen bg-slate-950" />;

  // NEW LOGIC: Setup first, then Auth
  if (!isSetupComplete) return <Setup onComplete={completeSetup} />;
  
  if (!isAuthenticated) return <Login onLogin={handleLogin} />;

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans">
      <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-600/20"><ShieldCheck className="w-6 h-6 text-white" /></div>
          <span className="text-xl font-black tracking-tighter">FORTRESS</span>
        </div>
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <button onClick={() => setCurrentView('dashboard')} className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all ${currentView === 'dashboard' ? 'bg-indigo-600/10 text-indigo-400 font-bold' : 'text-slate-500 hover:text-slate-100 hover:bg-slate-800'}`}><LayoutDashboard size={20} /> Dashboard</button>
          <button onClick={() => setCurrentView('jobs')} className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all ${currentView === 'jobs' ? 'bg-indigo-600/10 text-indigo-400 font-bold' : 'text-slate-500 hover:text-slate-100 hover:bg-slate-800'}`}><Layout size={20} /> Backup Jobs</button>
          <button onClick={() => setCurrentView('systems')} className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all ${currentView === 'systems' ? 'bg-indigo-600/10 text-indigo-400 font-bold' : 'text-slate-500 hover:text-slate-100 hover:bg-slate-800'}`}><Server size={20} /> Systems</button>
          <button onClick={() => setCurrentView('locations')} className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all ${currentView === 'locations' ? 'bg-indigo-600/10 text-indigo-400 font-bold' : 'text-slate-500 hover:text-slate-100 hover:bg-slate-800'}`}><HardDrive size={20} /> Locations</button>
        </nav>
        <div className="p-4 border-t border-slate-800 flex items-center gap-3">
           <img src={MOCK_USER.avatar} alt="User" className="w-8 h-8 rounded-full ring-2 ring-indigo-600/20" />
           <div className="flex-1 overflow-hidden"><p className="text-sm font-bold truncate">{MOCK_USER.name}</p></div>
           <button onClick={handleLogout} className="text-slate-500 hover:text-rose-400 transition-colors"><LogOut size={18} /></button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto flex flex-col">
        <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-8 py-4 flex justify-between items-center">
           <h2 className="text-xl font-black uppercase tracking-widest text-indigo-400 text-sm">{currentView}</h2>
           <div className="flex items-center gap-4">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-500 transition-colors" size={16} />
                <input type="text" placeholder="Search infrastructure..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-2xl pl-10 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none w-64 transition-all focus:w-80 shadow-inner"/>
              </div>
              <button className="p-2 text-slate-500 hover:text-white transition-colors bg-slate-800 rounded-xl border border-slate-700"><Settings size={20} /></button>
           </div>
        </header>
        <div className="p-8 flex-1">
          {currentView === 'dashboard' && <Dashboard jobs={jobs} />}
          {currentView === 'jobs' && <Jobs jobs={jobs} systems={systems} locations={locations} aiConfig={aiConfig} onAddJob={addJob} onDeleteJob={deleteJob} onRunJob={runJob} />}
          {currentView === 'systems' && <Systems systems={systems} jobs={jobs} onAddSystem={addSystem} sshKeys={sshKeys} onAddSSHKey={addSSHKey} onDeleteSSHKey={deleteSSHKey} onUpdateSSHKeysOrder={updateSSHKeysOrder} />}
          {currentView === 'locations' && <Locations locations={locations} onAddLocation={addLocation} onDeleteLocation={deleteLocation} />}
        </div>
      </main>
    </div>
  );
}
export default App;