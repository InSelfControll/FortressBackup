import React, { useState, useEffect } from 'react';
import { View, User, BackupJob, BackupTool, JobStatus, System, JobPriority, SSHKey, Location, AIConfig, AIProvider, DatabaseConfig, SSOConfig } from './types.ts';
import { Login } from './components/Login.tsx';
import { Setup } from './components/Setup.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { Jobs } from './components/Jobs.tsx';
import { Systems } from './components/Systems.tsx';
import { Locations } from './components/Locations.tsx';
import { Settings as SettingsComponent } from './components/Settings.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { Header } from './components/layout/Header.tsx';
import { Loader2 } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import * as API from './client/api/index.js';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './client/api/queries.js';

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  const queryClient = useQueryClient();

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
    const systems = queryClient.getQueryData(queryKeys.systems);
    const jobs = queryClient.getQueryData(queryKeys.jobs);
    const locations = queryClient.getQueryData(queryKeys.locations);
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
    return <Login onLogin={handleLogin} ssoConfig={ssoConfig} authMode={authMode} />;
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      <Sidebar
        currentView={currentView}
        setCurrentView={setCurrentView}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header
          currentView={currentView}
          setCurrentView={setCurrentView}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-6" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
          <div className="max-w-7xl mx-auto">
            {currentView === 'dashboard' && <Dashboard />}
            {currentView === 'jobs' && <Jobs aiConfig={aiConfig} />}
            {currentView === 'systems' && <Systems />}
            {currentView === 'locations' && <Locations />}
            {currentView === 'settings' && <SettingsComponent aiConfig={aiConfig} dbConfig={dbConfig} ssoConfig={ssoConfig} onUpdateAIConfig={updateAIConfig} onUpdateDBConfig={updateDBConfig} onUpdateSSOConfig={updateSSOConfig} onResetApp={handleResetApp} onExportData={handleExportData} onImportData={handleImportData} />}
          </div>
        </div>
      </main>
      <Toaster position="bottom-right" />
    </div>
  );
}

export default App;
