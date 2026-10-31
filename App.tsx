import { importData } from './client/dataTransfer';
import React, { useState, useEffect, useCallback } from 'react';
import { View, User, BackupJob, BackupTool, JobStatus, System, JobPriority, SSHKey, Location, AIConfig, AIProvider, DatabaseConfig, SSOConfig } from './types.ts';
import { Login } from './components/Login.tsx';
import { Setup } from './components/Setup.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { Jobs } from './components/Jobs.tsx';
import { Systems } from './components/Systems.tsx';
import { ManagedClients } from './components/ManagedClients.tsx';
import { Locations } from './components/Locations.tsx';
import { Settings as SettingsComponent } from './components/Settings.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { Header } from './components/layout/Header.tsx';
import { MobileNavigation } from './components/layout/MobileNavigation.tsx';
import { Loader2 } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import * as API from './client/api/index.js';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './client/api/queries.js';

interface DataExportInput {
  currentUser: User | null;
  systems: unknown;
  jobs: unknown;
  locations: unknown;
  aiConfig: unknown;
  dbConfig: unknown;
  ssoConfig: unknown;
}

export const getPublicSsoConfig = ({ provider, clientId, discoveryUrl }: SSOConfig): SSOConfig => ({
  provider,
  clientId,
  discoveryUrl
});

export const createDataExport = ({ currentUser, systems, jobs, locations }: DataExportInput) => {
  if (currentUser?.role !== 'admin') return null;
  return {
    systems,
    jobs,
    locations,
    exportedAt: new Date().toISOString()
  };
};

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [startupError, setStartupError] = useState('');
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState('');
  const [configVersion, setConfigVersion] = useState(0);
  const [currentView, setCurrentViewState] = useState<View>('dashboard');
  const [navigationOpen, setNavigationOpen] = useState(false);
  const closeNavigation = useCallback(() => setNavigationOpen(false), []);
  const setCurrentView = (view: View) => {
    closeNavigation();
    setCurrentViewState(view);
  };
  const [searchQuery, setSearchQuery] = useState('');

  const queryClient = useQueryClient();

  const [aiConfig, setAiConfig] = useState<AIConfig>({ provider: AIProvider.NONE });
  const [dbConfig, setDbConfig] = useState<DatabaseConfig | null>(null);
  const [ssoConfig, setSsoConfig] = useState<SSOConfig | null>(null);
  const [publicSsoConfig, setPublicSsoConfig] = useState<SSOConfig | null>(null);
  const [authMode, setAuthMode] = useState<'local' | 'sso' | null>(null);

  const clearAuthenticatedState = () => {
    setAiConfig({ provider: AIProvider.NONE });
    setDbConfig(null);
    setSsoConfig(null);
    setCurrentView('dashboard');
    setCurrentUser(null);
  };

  useEffect(() => API.subscribeToSessionTeardown(clearAuthenticatedState), []);

  // Initialize the application
  useEffect(() => {
    const initApp = async () => {
      setIsLoading(true); setStartupError('');
      try {
        // Check backend API for status
        const response = await fetch('/api/status');
        if (!response.ok) {
          throw new Error('The controller is unavailable. Check the connection and retry.');
        }

        const backendStatus = await response.json();
        if (!backendStatus.dbInitialized) throw new Error('The controller database is unavailable. Check the server configuration and retry.');

        if (backendStatus.setupComplete) {
          // Backend has completed setup - load public config
          try {
            const configResp = await fetch('/api/config/public');
            if (configResp.ok) {
              const { authMode: mode, ssoConfig: sso } = await configResp.json();
              if (mode) {
                setAuthMode(mode);
                localStorage.setItem('fortress_auth_mode', mode);
              }
              if (sso) {
                setPublicSsoConfig(getPublicSsoConfig(sso));
                setSsoConfig(sso);
              }
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
              const verified = API.requireData(await API.getMe());
              setCurrentUser(verified.user);
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
        setStartupError(error instanceof Error ? error.message : 'The controller could not be reached');
      } finally {
        setIsLoading(false);
      }
    };

    initApp();
  }, [startupAttempt]);

  useEffect(() => {
    if (currentUser?.role !== 'admin') return;
    let cancelled = false;
    setConfigLoading(true);
    setConfigError('');
    Promise.all([
      API.getConfig<AIConfig>('ai_config').then(API.requireData),
      API.getConfig<DatabaseConfig>('db_config').then(API.requireData),
      API.getConfig<SSOConfig>('sso_config').then(API.requireData)
    ]).then(([ai, database, sso]) => {
      if (cancelled) return;
      setAiConfig(ai.value || { provider: AIProvider.NONE });
      setDbConfig(database.value);
      setSsoConfig(sso.value);
    }).catch(error => { if (!cancelled) setConfigError(error.message); })
      .finally(() => { if (!cancelled) setConfigLoading(false); });
    return () => { cancelled = true; };
  }, [currentUser?.id, configVersion]);

  const handleLogin = (user: User) => {
    setAiConfig({ provider: AIProvider.NONE });
    setDbConfig(null);
    setSsoConfig(user.role === 'admin' ? publicSsoConfig : null);
    setCurrentView('dashboard');
    setCurrentUser(user);
    localStorage.setItem('fortress_user_session', JSON.stringify(user));
  };

  const handleLogout = async () => {
    try {
      await API.logout();
    } catch (error) {
      console.error('Failed to revoke session:', error);
    } finally {
      clearAuthenticatedState();
    }
  };

  const completeSetup = async (config: {
    masterPassword: string;
    bootstrapToken: string;
    aiConfig: AIConfig;
    dbConfig: DatabaseConfig;
    ssoConfig: SSOConfig;
    authMode: 'local' | 'sso';
    adminUser?: { name: string; email: string; password: string };
    selectedTools: string[];
  }) => {
    const { aiConfig: ai, dbConfig: db, ssoConfig: sso, authMode: mode, adminUser, selectedTools, bootstrapToken } = config;

    setAiConfig(ai);
    setDbConfig(db);
    setSsoConfig(sso);
    setPublicSsoConfig(getPublicSsoConfig(sso));
    setAuthMode(mode);

    try {
      // Call backend API to save config and generate .env file
      const { data: result, error } = await API.completeSetup({
        aiConfig: ai,
        dbConfig: db,
        ssoConfig: sso,
        authMode: mode,
        adminUser: adminUser,
        selectedTools: selectedTools,
        bootstrapToken
      } as any);

      if (result && result.success) {
        console.log('[Setup] Configuration saved');

        // Store auth mode for login page
        localStorage.setItem('fortress_auth_mode', mode);

        // If admin user was created and token returned, auto-login
        if (result.token && result.user) {
          setCurrentUser(result.user);
          localStorage.setItem('fortress_user_session', JSON.stringify(result.user));
        }
      } else {
        throw new Error(error || 'Setup could not be saved');
      }
    } catch (error) {
      throw error;
    }

    // Create vault salt if not exists
    if (!localStorage.getItem('fortress_vault_salt')) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      localStorage.setItem('fortress_vault_salt', btoa(String.fromCharCode(...salt)));
    }

    setIsSetupComplete(true);
  };

  const updateAIConfig = async (config: AIConfig) => {
    if (currentUser?.role !== 'admin') throw new Error('Administrator access required');
    API.requireData(await API.saveConfig('ai_config', config));
    setAiConfig(config);
  };

  const updateDBConfig = async (config: DatabaseConfig) => {
    if (currentUser?.role !== 'admin') throw new Error('Administrator access required');
    API.requireData(await API.saveConfig('db_config', config));
    setDbConfig(config);
  };

  const updateSSOConfig = async (config: SSOConfig) => {
    if (currentUser?.role !== 'admin') throw new Error('Administrator access required');
    API.requireData(await API.saveConfig('sso_config', config));
    setSsoConfig(config);
    setPublicSsoConfig(getPublicSsoConfig(config));
  };

  const updateAuthMode = async (mode: 'local' | 'sso') => {
    if (currentUser?.role !== 'admin') throw new Error('Administrator access required');
    API.requireData(await API.saveConfig('auth_mode', mode));
    setAuthMode(mode); localStorage.setItem('fortress_auth_mode', mode);
  };

  const handleResetApp = async () => {
    await handleLogout();
    localStorage.removeItem('fortress_auth_mode');
    localStorage.removeItem('fortress_vault_salt');
  };

  const handleExportData = async () => {
    if (currentUser?.role !== 'admin') throw new Error('Administrator access required');
    const [systems,jobs,locations] = await Promise.all([
      API.getSystems().then(API.requireData), API.getJobs().then(API.requireData), API.getLocations().then(API.requireData)
    ]);
    const exportData = createDataExport({currentUser,systems,jobs,locations,aiConfig,dbConfig,ssoConfig});
    if (!exportData) throw new Error('Export not permitted');
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `fortress-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportData = async (data: string) => {
    if (currentUser?.role !== 'admin') throw new Error('Administrator access required');
    try { await importData(data); }
    finally {
      await Promise.all([queryKeys.systems,queryKeys.locations,queryKeys.jobs].map(queryKey=>queryClient.invalidateQueries({queryKey})));
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

  if (startupError) return <div className="h-dvh p-6 flex flex-col items-center justify-center gap-4 text-slate-200 bg-slate-950"><p role="alert">{startupError}</p><button className="px-4 py-3 bg-indigo-600 rounded-xl" onClick={() => setStartupAttempt(v => v + 1)}>Retry connection</button></div>;

  // Setup flow
  if (isSetupComplete === false) {
    return <><Setup onComplete={completeSetup} /><Toaster position="bottom-right" /></>;
  }

  // Login required (after setup is complete)
  if (!currentUser) {
    return <Login onLogin={handleLogin} ssoConfig={publicSsoConfig} authMode={authMode} />;
  }

  return (
    <div className="flex h-dvh overflow-hidden" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      <div className="hidden lg:block shrink-0">
        <Sidebar
        currentView={currentView}
        setCurrentView={setCurrentView}
        currentUser={currentUser}
        onLogout={handleLogout}
        />
      </div>
      <MobileNavigation open={navigationOpen} onClose={closeNavigation} currentView={currentView} setCurrentView={setCurrentView} currentUser={currentUser} onLogout={handleLogout} />

      {/* Main Content */}
      <main className="min-w-0 min-h-0 flex-1 flex flex-col overflow-hidden">
        <Header
          currentView={currentView}
          setCurrentView={setCurrentView}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onOpenNavigation={() => setNavigationOpen(true)}
          navigationOpen={navigationOpen}
          showSettings={currentUser.role === 'admin'}
          showSearch={currentUser.role === 'admin' && ['dashboard','jobs','systems','locations'].includes(currentView)}
        />

        {/* Page Content */}
        <div data-app-content className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
          <div className="min-w-0 w-full max-w-7xl mx-auto">
            {currentView === 'dashboard' && (currentUser.role === 'admin' ? <Dashboard searchQuery={searchQuery} onOpenManagedClients={()=>setCurrentView('managed-clients')} /> : <p>Your account is signed in. Ask an administrator for access to backup management.</p>)}
            {currentView === 'jobs' && <Jobs aiConfig={aiConfig} searchQuery={searchQuery} />}
            {currentView === 'systems' && <Systems searchQuery={searchQuery} />}
            {currentView === 'managed-clients' && currentUser.role === 'admin' && <ManagedClients />}
            {currentView === 'locations' && <Locations searchQuery={searchQuery} />}
            {currentView === 'settings' && currentUser.role === 'admin' && (configLoading ? <p role="status">Loading saved settings...</p> : configError ? <div role="alert">{configError}<button className="ml-3 underline" onClick={() => setConfigVersion(v => v + 1)}>Retry settings</button></div> : <SettingsComponent authMode={authMode || 'local'} onUpdateAuthMode={updateAuthMode} aiConfig={aiConfig} dbConfig={dbConfig} ssoConfig={ssoConfig} onUpdateAIConfig={updateAIConfig} onUpdateDBConfig={updateDBConfig} onUpdateSSOConfig={updateSSOConfig} onResetApp={handleResetApp} onExportData={handleExportData} onImportData={handleImportData} />)}
          </div>
        </div>
      </main>
      <Toaster position="bottom-right" />
    </div>
  );
}

export default App;
