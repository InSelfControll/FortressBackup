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
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);
  const [isFirstRun, setIsFirstRun] = useState(false);
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
      try {
        // Check backend API for status
        const response = await fetch('/api/status');
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
        console.error('[Setup] Backend returned error:', error);
        return;
      }
    } catch (error) {
      console.error('[Setup] Failed to call backend API:', error);
      // Do not advance the wizard when the authoritative setup failed.
      return;
    }

    // Create vault salt if not exists
    if (!localStorage.getItem('fortress_vault_salt')) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      localStorage.setItem('fortress_vault_salt', btoa(String.fromCharCode(...salt)));
    }

    setIsSetupComplete(true);
  };

  const updateAIConfig = async (config: AIConfig) => {
    if (currentUser?.role !== 'admin') return;
    setAiConfig(config);
    try {
      await API.saveConfig('ai_config', config);
    } catch (e) { console.error('Failed to save AI config:', e); }
  };

  const updateDBConfig = async (config: DatabaseConfig) => {
    if (currentUser?.role !== 'admin') return;
    setDbConfig(config);
    try {
      await API.saveConfig('db_config', config);
    } catch (e) { console.error('Failed to save DB config:', e); }
  };

  const updateSSOConfig = async (config: SSOConfig) => {
    if (currentUser?.role !== 'admin') return;
    setSsoConfig(config);
    try {
      await API.saveConfig('sso_config', config);
    } catch (e) { console.error('Failed to save SSO config:', e); }
  };

  const handleResetApp = async () => {
    if (currentUser?.role !== 'admin') return;
    localStorage.clear();
    window.location.reload();
  };

  const handleExportData = () => {
    const exportData = createDataExport({
      currentUser,
      systems: queryClient.getQueryData(queryKeys.systems),
      jobs: queryClient.getQueryData(queryKeys.jobs),
      locations: queryClient.getQueryData(queryKeys.locations),
      aiConfig,
      dbConfig,
      ssoConfig
    });
    if (!exportData) return;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fortress-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = (data: string) => {
    if (currentUser?.role !== 'admin') return;
    try {
      const parsed = JSON.parse(data);
      if (parsed.systems) queryClient.setQueryData(queryKeys.systems, parsed.systems);
      if (parsed.jobs) queryClient.setQueryData(queryKeys.jobs, parsed.jobs);
      if (parsed.locations) queryClient.setQueryData(queryKeys.locations, parsed.locations);
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
        />

        {/* Page Content */}
        <div data-app-content className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
          <div className="min-w-0 w-full max-w-7xl mx-auto">
            {currentView === 'dashboard' && <Dashboard />}
            {currentView === 'jobs' && <Jobs aiConfig={aiConfig} />}
            {currentView === 'systems' && <Systems />}
            {currentView === 'managed-clients' && currentUser.role === 'admin' && <ManagedClients />}
            {currentView === 'locations' && <Locations />}
            {currentView === 'settings' && currentUser.role === 'admin' && <SettingsComponent aiConfig={aiConfig} dbConfig={dbConfig} ssoConfig={ssoConfig} onUpdateAIConfig={updateAIConfig} onUpdateDBConfig={updateDBConfig} onUpdateSSOConfig={updateSSOConfig} onResetApp={handleResetApp} onExportData={handleExportData} onImportData={handleImportData} />}
          </div>
        </div>
      </main>
      <Toaster position="bottom-right" />
    </div>
  );
}

export default App;
