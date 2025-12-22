
import React, { useState, useEffect } from 'react';
import { View, User, BackupJob, BackupTool, JobStatus, System, JobPriority, SSHKey, Location, AIConfig, AIProvider, DatabaseConfig, SSOConfig } from './types.ts';
import { Login } from './components/Login.tsx';
import { Setup } from './components/Setup.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { Jobs } from './components/Jobs.tsx';
import { Systems } from './components/Systems.tsx';
import { Locations } from './components/Locations.tsx';
import { Layout, LayoutDashboard, Server, HardDrive, Settings, LogOut, ShieldCheck, Search, Loader2 } from 'lucide-react';

const MOCK_USER: User = {
  id: 'u1',
  name: 'Orchestrator Admin',
  email: 'admin@fortress.io',
  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Fortress',
  role: 'admin',
  setupComplete: false
};

const INITIAL_JOBS: BackupJob[] = [];
const INITIAL_SYSTEMS: System[] = [
  { id: 'sys-1', name: 'Primary DB Node', host: '10.0.0.50', username: 'root', type: 'remote', status: 'online', lastSeen: 'Now', health: 98, installedTools: [] },
];
const INITIAL_LOCATIONS: Location[] = [];

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
  const [dbConfig, setDbConfig] = useState<DatabaseConfig | null>(null);
  const [ssoConfig, setSsoConfig] = useState<SSOConfig | null>(null);

  useEffect(() => {
    // Key used to determine if setup was run: 'fortress_setup_complete_v2'
    const setupDone = localStorage.getItem('fortress_setup_complete_v2');
    const savedSystems = localStorage.getItem('fortress_systems_v2');
    const savedDb = localStorage.getItem('fortress_db_config');
    
    // We only skip setup if both the flag is set AND we have a valid DB config
    if (setupDone === 'true' && savedDb) {
      setIsSetupComplete(true);
      try {
        setAiConfig(JSON.parse(localStorage.getItem('fortress_ai_config_v2') || '{}'));
        setDbConfig(JSON.parse(savedDb));
        setSsoConfig(JSON.parse(localStorage.getItem('fortress_sso_config') || '{}'));
        setSshKeys(JSON.parse(localStorage.getItem('fortress_vault_ssh_keys_v2') || '[]'));
        if (savedSystems) setSystems(JSON.parse(savedSystems));
      } catch (e) {
        console.error("Config load failed. Resetting setup state.", e);
        setIsSetupComplete(false);
      }
    } else {
      setIsSetupComplete(false);
    }
  }, []);

  useEffect(() => {
    if (isSetupComplete) {
      localStorage.setItem('fortress_systems_v2', JSON.stringify(systems));
    }
  }, [systems, isSetupComplete]);

  useEffect(() => {
    if (isSetupComplete) {
      localStorage.setItem('fortress_vault_ssh_keys_v2', JSON.stringify(sshKeys));
    }
  }, [sshKeys, isSetupComplete]);

  const handleLogin = () => setIsAuthenticated(true);
  const handleLogout = () => setIsAuthenticated(false);

  const completeSetup = (masterPassword: string, ai: AIConfig, db: DatabaseConfig, sso: SSOConfig) => {
    setAiConfig(ai);
    setDbConfig(db);
    setSsoConfig(sso);
    
    localStorage.setItem('fortress_setup_complete_v2', 'true');
    localStorage.setItem('fortress_ai_config_v2', JSON.stringify(ai));
    localStorage.setItem('fortress_db_config', JSON.stringify(db));
    localStorage.setItem('fortress_sso_config', JSON.stringify(sso));
    
    if (!localStorage.getItem('fortress_vault_salt')) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      localStorage.setItem('fortress_vault_salt', btoa(String.fromCharCode(...salt)));
    }

    setIsSetupComplete(true);
  };

  const updateSystem = (updatedSys: System) => {
    setSystems(prev => prev.map(s => s.id === updatedSys.id ? updatedSys : s));
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

  const addLocation = (loc: Location) => setLocations([...locations, loc]);
  const deleteLocation = (id: string) => setLocations(locations.filter(l => l.id !== id));

  if (isSetupComplete === null) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={48}/></div>;

  if (!isSetupComplete) return <Setup onComplete={completeSetup} />;
  
  if (!isAuthenticated) return <Login onLogin={handleLogin} ssoConfig={ssoConfig} />;

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30 overflow-hidden relative">
      {/* High Fidelity CSS Noise & Background Gradients */}
      <div className="absolute inset-0 pointer-events-none opacity-20 z-0" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}></div>
      <div className="absolute top-0 right-0 w-[50%] h-[50%] bg-indigo-600/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2"></div>
      
      <aside className="w-72 bg-slate-950 border-r border-slate-800/40 flex flex-col shadow-2xl relative z-10">
        <div className="p-8 flex items-center gap-4">
          <div className="bg-indigo-600 p-2.5 rounded-[1.25rem] shadow-2xl shadow-indigo-600/40 border border-indigo-400/30">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-black tracking-tighter text-white">FORTRESS</span>
            <span className="text-[9px] font-black uppercase text-indigo-400 tracking-[0.2em] leading-none">Command Center</span>
          </div>
        </div>
        
        <nav className="flex-1 px-6 space-y-3 mt-4">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'jobs', label: 'Backup Streams', icon: Layout },
            { id: 'systems', label: 'Managed Nodes', icon: Server },
            { id: 'locations', label: 'Storage Registry', icon: HardDrive },
          ].map((item) => {
            const Icon = item.icon;
            const active = currentView === item.id;
            return (
              <button 
                key={item.id}
                onClick={() => setCurrentView(item.id as View)} 
                className={`flex items-center gap-4 w-full px-5 py-4 rounded-2xl transition-all group ${
                  active ? 'bg-indigo-600/10 text-white font-bold border border-indigo-500/20 shadow-lg' : 'text-slate-500 hover:text-slate-100 hover:bg-slate-900/40'
                }`}
              >
                <Icon size={20} className={active ? 'text-indigo-400' : 'group-hover:text-indigo-400 transition-colors'} /> 
                <span className="text-sm tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </nav>
        
        <div className="p-6 border-t border-slate-800/50 m-4 bg-slate-900/30 rounded-[2rem] border border-slate-800/50 shadow-inner">
           <div className="flex items-center gap-4 mb-4">
             <img src={MOCK_USER.avatar} alt="User" className="w-10 h-10 rounded-2xl ring-2 ring-indigo-600/20 border-2 border-slate-800" />
             <div className="flex-1 overflow-hidden">
                <p className="text-sm font-black text-white truncate">{MOCK_USER.name}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{MOCK_USER.role}</p>
             </div>
           </div>
           <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 rounded-xl transition-all border border-slate-700/50 text-xs font-black uppercase tracking-widest">
             <LogOut size={14} /> Terminate Session
           </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto flex flex-col relative z-10">
        <header className="sticky top-0 z-30 bg-slate-950/60 backdrop-blur-2xl border-b border-slate-800/40 px-10 py-6 flex justify-between items-center">
           <div className="flex items-center gap-3">
             <div className="w-1.5 h-6 bg-indigo-600 rounded-full shadow-[0_0_10px_rgba(79,70,229,0.5)]"/>
             <h2 className="text-lg font-black uppercase tracking-[0.3em] text-indigo-400 text-[10px]">{currentView}</h2>
           </div>
           <div className="flex items-center gap-6">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-500 transition-colors" size={16} />
                <input 
                  type="text" 
                  placeholder="Query Infrastructure..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className="bg-slate-900/50 border border-slate-800/60 rounded-2xl pl-12 pr-6 py-3 text-xs text-white focus:ring-2 focus:ring-indigo-500 outline-none w-64 transition-all focus:w-96 shadow-inner font-mono"
                />
              </div>
              <button className="p-3 text-slate-500 hover:text-white transition-all bg-slate-900/50 rounded-2xl border border-slate-800/60 hover:border-indigo-500/40 shadow-xl group">
                <Settings size={20} className="group-rotate-90 transition-transform duration-700"/>
              </button>
           </div>
        </header>

        <div className="p-10 flex-1 max-w-[1600px] mx-auto w-full">
          {currentView === 'dashboard' && <Dashboard jobs={jobs} />}
          {currentView === 'jobs' && <Jobs jobs={jobs} systems={systems} locations={locations} aiConfig={aiConfig} onAddJob={addJob} onDeleteJob={deleteJob} onRunJob={runJob} />}
          {currentView === 'systems' && <Systems systems={systems} jobs={jobs} onAddSystem={addSystem} sshKeys={sshKeys} onAddSSHKey={addSSHKey} onDeleteSSHKey={deleteSSHKey} onUpdateSystem={updateSystem} />}
          {currentView === 'locations' && <Locations locations={locations} onAddLocation={addLocation} onDeleteLocation={deleteLocation} />}
        </div>
      </main>
    </div>
  );
}

export default App;
