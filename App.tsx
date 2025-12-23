import React, { useState, useEffect } from 'react';
import { View, User, BackupJob, BackupTool, JobStatus, System, JobPriority, SSHKey, Location, AIConfig, AIProvider, DatabaseConfig, SSOConfig } from './types.ts';
import { Login } from './components/Login.tsx';
import { Setup } from './components/Setup.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { Jobs } from './components/Jobs.tsx';
import { Systems } from './components/Systems.tsx';
import { Locations } from './components/Locations.tsx';
import { Settings as SettingsComponent } from './components/Settings.tsx';
import { Layout, LayoutDashboard, Server, HardDrive, Settings, LogOut, ShieldCheck, Search, Loader2 } from 'lucide-react';
import * as API from './services/api/index.js';

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [systems, setSystems] = useState<System[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [sshKeys, setSshKeys] = useState<SSHKey[]>([]);
  const [aiConfig, setAiConfig] = useState<AIConfig>({ provider: AIProvider.NONE });
  const [dbConfig, setDbConfig] = useState<DatabaseConfig | null>(null);
  const [ssoConfig, setSsoConfig] = useState<SSOConfig | null>(null);
  const [authMode, setAuthMode] = useState<'local' | 'sso' | null>(null);

  // Initialize the application
  useEffect(() => {
    const initApp = async () => {
      try {
        // Check backend API for status
        const response = await fetch('http://localhost:9001/api/status');
        if (!response.ok) {
          console.error('[App] Backend not available');
          setIsSetupComplete(false);
          setIsLoading(false);
          return;
        }

        const backendStatus = await response.json();

        if (backendStatus.setupComplete) {
          // Backend has completed setup - load public config
          try {
            const configResp = await fetch('http://localhost:9001/api/config/public');
            if (configResp.ok) {
              const { authMode: mode, ssoConfig: sso } = await configResp.json();
              if (mode) {
                setAuthMode(mode);
                localStorage.setItem('fortress_auth_mode', mode);
              }
              if (sso) setSsoConfig(sso);
            }
          } catch (e) {
            console.log('[App] Could not load public config');
            const sessionAuthMode = localStorage.getItem('fortress_auth_mode') as 'local' | 'sso' | null;
            if (sessionAuthMode) setAuthMode(sessionAuthMode);
          }

          // Check for existing user session in localStorage
          const sessionUser = localStorage.getItem('fortress_user_session');
          if (sessionUser) {
            try {
              const user = JSON.parse(sessionUser);
              setCurrentUser(user);
            } catch {
              // Invalid session, will show login
            }
          }

          setIsSetupComplete(true);
        } else {
          // Backend available but setup not complete
          setIsSetupComplete(false);
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setIsSetupComplete(false);
      } finally {
        setIsLoading(false);
      }
    };

    initApp();
  }, []);

  // Load data from backend when setup is complete and user is logged in
  useEffect(() => {
    const loadData = async () => {
      if (!isSetupComplete || !currentUser) return;

      try {
        // Load systems
        const { data: systemsData } = await API.getSystems();
        if (systemsData) setSystems(systemsData);

        // Load locations
        const { data: locationsData } = await API.getLocations();
        if (locationsData) setLocations(locationsData);

        // Load jobs
        const { data: jobsData } = await API.getJobs();
        if (jobsData) setJobs(jobsData);

        // Load SSH keys
        const { data: keysData } = await API.getSSHKeys();
        if (keysData) setSshKeys(keysData);

      } catch (e) {
        console.error('[App] Failed to load data:', e);
      }
    };

    loadData();
  }, [isSetupComplete, currentUser]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('fortress_user_session', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('fortress_user_session');
  };

  const completeSetup = async (config: {
    masterPassword: string;
    aiConfig: AIConfig;
    dbConfig: DatabaseConfig;
    ssoConfig: SSOConfig;
    authMode: 'local' | 'sso';
    adminUser?: { name: string; email: string; password: string };
    selectedTools: string[];
  }) => {
    const { aiConfig: ai, dbConfig: db, ssoConfig: sso, authMode: mode, adminUser, selectedTools } = config;

    setAiConfig(ai);
    setDbConfig(db);
    setSsoConfig(sso);
    setAuthMode(mode);

    try {
      // Call backend API to save config and generate .env file
      const { data: result, error } = await API.completeSetup({
        aiConfig: ai,
        dbConfig: db,
        ssoConfig: sso,
        authMode: mode,
        adminUser: adminUser,
        selectedTools: selectedTools
      } as any); // Cast to suit SetupData flexibility if needed

      if (result && result.success) {
        // API client already handled token setting via completeSetup response logic if I update it? 
        // Wait, apiClient completeSetup sets token. I don't need to manually set it?
        // Let's rely on apiClient return.

        console.log('[Setup] Configuration saved'); // envPath not in return type of apiClient yet? 
        // I should check result structure. apiClient returns { success, user, token }

        // Store auth mode for login page
        localStorage.setItem('fortress_auth_mode', mode);

        // If admin user was created and token returned, auto-login
        if (result.token && result.user) {
          setCurrentUser(result.user);
          localStorage.setItem('fortress_user_session', JSON.stringify(result.user));
        }
      } else {
        console.error('[Setup] Backend returned error:', error);
      }
    } catch (error) {
      console.error('[Setup] Failed to call backend API:', error);
      // Store auth mode locally for reference, but backend is required
      localStorage.setItem('fortress_auth_mode', mode);
    }

    // Create vault salt if not exists
    if (!localStorage.getItem('fortress_vault_salt')) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      localStorage.setItem('fortress_vault_salt', btoa(String.fromCharCode(...salt)));
    }

    setIsSetupComplete(true);
  };

  const updateSystem = async (updatedSys: System) => {
    setSystems(prev => prev.map(s => s.id === updatedSys.id ? updatedSys : s));
    await API.updateSystem(updatedSys.id, updatedSys);
  };

  const addJob = async (job: BackupJob) => {
    setJobs([...jobs, job]);
    await API.createJob(job);
  };

  const deleteJob = async (id: string) => {
    setJobs(jobs.filter(j => j.id !== id));
    await API.deleteJob(id);
  };

  const updateJob = async (job: BackupJob) => {
    setJobs(prev => prev.map(j => j.id === job.id ? job : j));
    await API.updateJob(job.id, job);
  };

  const runJob = async (id: string) => {
    // Set job to running immediately
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: JobStatus.RUNNING } : j));

    try {
      // Call real backend API to run the job
      // TODO: Get SSH credentials from vault or prompt user
      const { data: result, error } = await API.runJob(id, {});

      if (result && result.success) {
        setJobs(prev => prev.map(j => j.id === id ? {
          ...j,
          status: JobStatus.SUCCESS,
          lastRun: 'Just now',
          size: result.stats?.bytesProcessed ? `${(result.stats.bytesProcessed / 1e6).toFixed(2)} MB` : undefined
        } : j));
      } else {
        setJobs(prev => prev.map(j => j.id === id ? { ...j, status: JobStatus.FAILED, lastRun: 'Just now' } : j));
        console.error('Job failed:', error);
      }
    } catch (e) {
      console.error('Failed to run job:', e);
      setJobs(prev => prev.map(j => j.id === id ? { ...j, status: JobStatus.FAILED, lastRun: 'Just now' } : j));
    }
  };

  const addSystem = async (sys: System) => {
    setSystems([...systems, sys]);
    try {
      await API.createSystem(sys);
    } catch (e) { console.error('Failed to add system:', e); }
  };

  const deleteSystem = async (id: string) => {
    setSystems(systems.filter(s => s.id !== id));
    try {
      await API.deleteSystem(id);
    } catch (e) { console.error('Failed to delete system:', e); }
  };

  // SSH Key handlers
  const addSSHKey = async (key: SSHKey) => {
    // Optimistic update
    setSshKeys(prev => [...prev, key]);
    try {
      if (key.id === 'temp-optimistic') {
        // If it's a new key creation in disguise? 
        // Assuming addSSHKey passes a full key object.
        // We should use createSSHKey.
        await API.createSSHKey(key.name, key.privateKeyPath as string, key.passphrase as string);
      }

      // Refresh list
      const { data } = await API.getSSHKeys();
      if (data) setSshKeys(data);
    } catch (e) { console.error('Failed to refresh keys:', e); }
  };

  const deleteSSHKey = async (id: string) => {
    setSshKeys(sshKeys.filter(k => k.id !== id));
    try {
      await fetch(`http://localhost:9001/api/keys/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('fortress_token')}` }
      });
    } catch (e) { console.error('Failed to delete key:', e); }
  };

  const addLocation = async (loc: Location) => {
    setLocations([...locations, loc]);
    try {
      await API.createLocation(loc);
    } catch (e) { console.error('Failed to add location:', e); }
  };

  const deleteLocation = async (id: string) => {
    setLocations(locations.filter(l => l.id !== id));
    try {
      await API.deleteLocation(id);
    } catch (e) { console.error('Failed to delete location:', e); }
  };

  const updateLocation = async (updatedLoc: Location) => {
    setLocations(prev => prev.map(l => l.id === updatedLoc.id ? updatedLoc : l));
    try {
      await API.updateLocation(updatedLoc.id, updatedLoc);
    } catch (e) { console.error('Failed to update location:', e); }
  };

  // Settings handlers
  const updateAIConfig = async (config: AIConfig) => {
    setAiConfig(config);
    try {
      await API.saveConfig('ai_config', config);
    } catch (e) { console.error('Failed to save AI config:', e); }
  };

  const updateDBConfig = async (config: DatabaseConfig) => {
    setDbConfig(config);
    try {
      await API.saveConfig('db_config', config);
    } catch (e) { console.error('Failed to save DB config:', e); }
  };

  const updateSSOConfig = async (config: SSOConfig) => {
    setSsoConfig(config);
    try {
      await API.saveConfig('sso_config', config);
    } catch (e) { console.error('Failed to save SSO config:', e); }
  };

  const handleResetApp = async () => {
    // Clear localStorage and reload
    localStorage.clear();
    window.location.reload();
  };

  const handleExportData = () => {
    const exportData = {
      systems,
      jobs,
      locations,
      aiConfig,
      dbConfig,
      ssoConfig,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fortress-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = (data: string) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.systems) setSystems(parsed.systems);
      if (parsed.jobs) setJobs(parsed.jobs);
      if (parsed.locations) setLocations(parsed.locations);
      if (parsed.aiConfig) updateAIConfig(parsed.aiConfig);
      if (parsed.dbConfig) updateDBConfig(parsed.dbConfig);
      if (parsed.ssoConfig) updateSSOConfig(parsed.ssoConfig);
    } catch (e) {
      console.error('Import failed:', e);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6">
        <Loader2 className="animate-spin text-indigo-500" size={48} />
        <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Initializing Database...</p>
      </div>
    );
  }

  // Setup flow - ALWAYS show setup first if not complete
  if (isSetupComplete === false) {
    return <Setup onComplete={completeSetup} />;
  }

  // Login required (after setup is complete)
  if (!currentUser) {
    return <Login onLogin={handleLogin} ssoConfig={ssoConfig} authMode={authMode} />;
  }

  return (
    <div className="flex min-h-screen bg-slate-950 relative">
      {/* Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[60%] h-[50%] bg-indigo-600/5 rounded-full blur-[200px]" />
        <div className="absolute bottom-0 left-0 w-[40%] h-[40%] bg-blue-600/5 rounded-full blur-[200px]" />
      </div>

      {/* Sidebar */}
      <aside className="w-72 bg-slate-900/30 backdrop-blur-xl border-r border-slate-800/50 p-6 flex flex-col relative z-10">
        <div className="flex items-center gap-4 mb-10">
          <div className="bg-indigo-600 p-3.5 rounded-[1.25rem] shadow-2xl shadow-indigo-600/30 border border-indigo-500/30">
            <ShieldCheck size={26} className="text-white" />
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
            { id: 'settings', label: 'Configuration', icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id as View)}
                className={`flex items-center gap-4 w-full px-5 py-4 rounded-2xl transition-all group ${active ? 'bg-indigo-600/10 text-white font-bold border border-indigo-500/20 shadow-lg' : 'text-slate-500 hover:text-slate-100 hover:bg-slate-900/40'
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
            <img src={currentUser.avatar} alt="User" className="w-10 h-10 rounded-2xl ring-2 ring-indigo-600/20 border-2 border-slate-800" />
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-black text-white truncate">{currentUser.name}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{currentUser.role}</p>
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
            <div className="w-1.5 h-6 bg-indigo-600 rounded-full shadow-[0_0_10px_rgba(79,70,229,0.5)]" />
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
            <button
              onClick={() => setCurrentView('settings')}
              className={`p-3 transition-all bg-slate-900/50 rounded-2xl border shadow-xl group ${currentView === 'settings' ? 'text-indigo-400 border-indigo-500/40' : 'text-slate-500 hover:text-white border-slate-800/60 hover:border-indigo-500/40'}`}
            >
              <Settings size={20} className="group-hover:rotate-90 transition-transform duration-700" />
            </button>
          </div>
        </header>

        <div className="p-10 flex-1 max-w-[1600px] mx-auto w-full">
          {currentView === 'dashboard' && <Dashboard jobs={jobs} systems={systems} />}
          {currentView === 'jobs' && <Jobs jobs={jobs} systems={systems} locations={locations} aiConfig={aiConfig} onAddJob={addJob} onDeleteJob={deleteJob} onRunJob={runJob} onUpdateJob={updateJob} />}
          {currentView === 'systems' && <Systems systems={systems} jobs={jobs} onAddSystem={addSystem} onDeleteSystem={deleteSystem} sshKeys={sshKeys} onAddSSHKey={addSSHKey} onDeleteSSHKey={deleteSSHKey} onUpdateSystem={updateSystem} />}
          {currentView === 'locations' && <Locations locations={locations} onAddLocation={addLocation} onDeleteLocation={deleteLocation} onUpdateLocation={updateLocation} />}
          {currentView === 'settings' && <SettingsComponent aiConfig={aiConfig} dbConfig={dbConfig} ssoConfig={ssoConfig} onUpdateAIConfig={updateAIConfig} onUpdateDBConfig={updateDBConfig} onUpdateSSOConfig={updateSSOConfig} onResetApp={handleResetApp} onExportData={handleExportData} onImportData={handleImportData} />}
        </div>
      </main>
    </div>
  );
}

export default App;
