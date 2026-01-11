import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AIConfig, DatabaseConfig, SSOConfig, AIProvider } from '../../types';
import * as API from '../../client/api/index.js';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../client/api/queries.js';

interface AppContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  isSetupComplete: boolean | null;
  setIsSetupComplete: (complete: boolean | null) => void;
  aiConfig: AIConfig;
  setAiConfig: (config: AIConfig) => void;
  dbConfig: DatabaseConfig | null;
  setDbConfig: (config: DatabaseConfig | null) => void;
  ssoConfig: SSOConfig | null;
  setSsoConfig: (config: SSOConfig | null) => void;
  authMode: 'local' | 'sso' | null;
  setAuthMode: (mode: 'local' | 'sso' | null) => void;
  handleLogin: (user: User) => void;
  handleLogout: () => void;
  handleExportData: () => void;
  handleImportData: (data: string) => void;
  handleResetApp: () => void;
  completeSetup: (config: {
    masterPassword: string;
    aiConfig: AIConfig;
    dbConfig: DatabaseConfig;
    ssoConfig: SSOConfig;
    authMode: 'local' | 'sso';
    adminUser?: { name: string; email: string; password: string };
    selectedTools: string[];
  }) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  // Initialize currentUser from localStorage to prevent redirect loop on page refresh
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const savedUser = localStorage.getItem('fortress_user_session');
      if (savedUser) {
        const user = JSON.parse(savedUser);
        console.log('[AppContext] Restored user from session:', user?.email);
        return user;
      }
    } catch (e) {
      console.error('[AppContext] Failed to restore user session:', e);
    }
    return null;
  });
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);
  const [aiConfig, setAiConfig] = useState<AIConfig>({ provider: AIProvider.NONE });
  const [dbConfig, setDbConfig] = useState<DatabaseConfig | null>(null);
  const [ssoConfig, setSsoConfig] = useState<SSOConfig | null>(null);
  const [authMode, setAuthMode] = useState<'local' | 'sso' | null>(null);

  const queryClient = useQueryClient();

  // Initialize the application
  useEffect(() => {
    const initApp = async () => {
      console.log('[AppContext] Starting initialization...');
      try {
        // Check backend API for status
        const response = await fetch('/api/status');
        console.log('[AppContext] Backend status response:', response.status);

        if (!response.ok) {
          console.error('[App] Backend not available');
          setIsSetupComplete(false);
          return;
        }

        const backendStatus = await response.json();
        console.log('[AppContext] Backend status:', backendStatus);

        if (backendStatus.setupComplete) {
          console.log('[AppContext] Setup is complete, loading config...');
          // Backend has completed setup - load public config
          try {
            const configResp = await fetch('/api/config/public');
            if (configResp.ok) {
              try {
                const { authMode: mode, ssoConfig: sso } = await configResp.json();
                console.log('[AppContext] Loaded public config:', { mode, ssoConfig: sso });

                if (mode) {
                  setAuthMode(mode);
                  localStorage.setItem('fortress_auth_mode', mode);
                }
                if (sso) setSsoConfig(sso);
              } catch (parseError) {
                console.log('[App] Could not parse public config:', parseError);
              }
            } else {
              console.log('[AppContext] Could not load public config - response not ok');
            }
          } catch (error) {
            console.log('[App] Could not load public config - error:', error);
            const sessionAuthMode = localStorage.getItem('fortress_auth_mode') as 'local' | 'sso' | null;
            if (sessionAuthMode) setAuthMode(sessionAuthMode);
          }

          setIsSetupComplete(true);
          console.log('[AppContext] Initialization complete - setup finished');
        } else {
          console.log('[AppContext] Setup not complete');
          // Backend available but setup not complete
          setIsSetupComplete(false);
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setIsSetupComplete(false);
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

  const handleResetApp = async () => {
    // Clear localStorage and reload
    localStorage.clear();
    window.location.reload();
  };

  const value: AppContextType = {
    currentUser,
    setCurrentUser,
    isSetupComplete,
    setIsSetupComplete,
    aiConfig,
    setAiConfig,
    dbConfig,
    setDbConfig,
    ssoConfig,
    setSsoConfig,
    authMode,
    setAuthMode,
    handleLogin,
    handleLogout,
    handleExportData,
    handleImportData,
    handleResetApp,
    completeSetup,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};