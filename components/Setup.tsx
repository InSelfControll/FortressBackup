import { copyText } from '../client/browser';
import toast from 'react-hot-toast';

import React, { useEffect, useState } from 'react';
import {
  Shield, Key, Server, Check, ArrowRight, Github,
  ShieldCheck, Lock, Terminal, Info, Zap, Database, ExternalLink,
  ChevronRight, Circle, CheckCircle2, Layout, Boxes, Cpu, Plus, Sparkles, Globe, Brain,
  XCircle, Loader2, Link, Database as DbIcon, Settings2, RefreshCw, Copy
} from 'lucide-react';
import { AIProvider, AIConfig, DatabaseType, DatabaseConfig, SSOConfig } from '../types';

interface SetupProps {
  onComplete: (config: {
    masterPassword: string;
    bootstrapToken: string;
    aiConfig: AIConfig;
    dbConfig: DatabaseConfig;
    ssoConfig: SSOConfig;
    authMode: 'local' | 'sso';
    adminUser?: { name: string; email: string; password: string };
    selectedTools: string[];
  }) => void | Promise<void>;
}

type SetupStep = 'db' | 'auth' | 'welcome' | 'vault' | 'ai' | 'guide';

export const Setup: React.FC<SetupProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState<SetupStep>('db');

  // DB Config
  const [dbConfig, setDbConfig] = useState<DatabaseConfig>({ type: DatabaseType.SQLITE });
  const [isDbTesting, setIsDbTesting] = useState(false);
  const [activeDbType, setActiveDbType] = useState(DatabaseType.SQLITE);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/status', {signal:controller.signal}).then(response=>response.json()).then(status=>{
      const type = status.dbType === 'postgres' ? DatabaseType.POSTGRES : DatabaseType.SQLITE;
      setActiveDbType(type); setDbConfig({type});
    }).catch(()=>{});
    return () => controller.abort();
  }, []);

  // SSO Config
  const [ssoConfig, setSsoConfig] = useState<SSOConfig>({ provider: null });
  const [authMode, setAuthMode] = useState<'local' | 'sso' | null>(null);

  // Local Admin User
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');

  // Other configs
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>(['borg']);
  const [activeGuideTool, setActiveGuideTool] = useState<string>('borg');

  const [aiConfig, setAiConfig] = useState<AIConfig>({
    provider: AIProvider.NONE,
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: ''
  });

  const steps = [
    { id: 'db', label: 'Database', icon: DbIcon },
    { id: 'auth', label: 'Identity', icon: Shield },
    { id: 'welcome', label: 'Systems', icon: Layout },
    { id: 'vault', label: 'Vault', icon: Lock },
    { id: 'ai', label: 'AI intelligence', icon: Brain },
    { id: 'guide', label: 'Finalize', icon: Terminal },
  ];

  const testDbConnection = () => {
    window.alert('The database connection is configured when the controller starts. Complete setup, then verify the active database in Settings.');
  };

  const toggleTool = (tool: string) => {
    setSelectedTools(prev =>
      prev.includes(tool) ? prev.filter(t => t !== tool) : [...prev, tool]
    );
    setActiveGuideTool(tool);
  };

  const handleFinish = async () => {
    if (saving) return;
    setSaveError('');
    if (bootstrapToken.length < 32) { window.alert('Enter the one-time FORTRESS_BOOTSTRAP_TOKEN provisioned on the server'); return; }
    setSaving(true);
    try { await onComplete({
      masterPassword,
      bootstrapToken: bootstrapToken.trim(),
      aiConfig,
      dbConfig,
      ssoConfig,
      authMode: authMode || 'local',
      adminUser: authMode === 'local' ? {
        name: adminName,
        email: adminEmail,
        password: adminPassword
      } : undefined,
      selectedTools
    }); } catch(error) { setSaveError(error instanceof Error ? error.message : 'Setup failed'); }
    finally { setSaving(false); }
  };

  const redirectUri = window.location.origin + '/login';

  const guides: Record<string, any> = {
    borg: {
      title: 'BorgBackup Configuration',
      desc: 'Deduplicating, compressing, and authenticating archiver.',
      steps: [
        'Fortress will attempt automatic installation via SSH if root access is provided.',
        'Manual: `sudo apt install borgbackup` on target.',
        'Initialize the repository with `borg init --encryption=repokey-blake2` before the first backup.'
      ]
    },
    restic: {
      title: 'Restic Cloud Backup',
      desc: 'Fast, secure, efficient backup tool for cloud backends.',
      steps: [
        'Fortress can push the restic binary to /usr/local/bin automatically.',
        'Supports native S3-compatible backends and B2.',
        'Configured via the "Locations" tab post-setup.'
      ]
    },
    rsync: {
      title: 'Rsync Over SSH',
      desc: 'The classic file sync engine for 1:1 mirroring.',
      steps: [
        'Standard on most Linux distros.',
        'Assign an SSH identity and verified host key in Systems.',
        'Requires no extra daemon on target servers.'
      ]
    }
  };

  const getStepIndex = (id: string) => steps.findIndex(s => s.id === id);

  return (
    <div className="h-dvh bg-slate-950 flex flex-col items-center p-4 sm:p-6 relative overflow-x-hidden overflow-y-auto">
      <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }}></div>
      <div className="absolute top-0 left-0 w-full h-full z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-indigo-600/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] bg-blue-600/10 rounded-full blur-[140px]" />
      </div>

      <div className="relative z-10 w-full max-w-5xl flex shrink-0 flex-col gap-8 my-auto animate-in fade-in slide-in-from-bottom-6 duration-700">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-widest mb-2 shadow-sm">
            <Zap size={14} className="fill-current" /> Production Orchestration Setup
          </div>
          <label className="block max-w-lg mx-auto text-xs text-slate-300 mt-3">One-time server bootstrap token
            <input type="password" autoComplete="new-password" value={bootstrapToken} onChange={e=>setBootstrapToken(e.target.value)}
              className="block w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 mt-2 text-white"
              placeholder="FORTRESS_BOOTSTRAP_TOKEN" />
          </label>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tighter leading-tight">Fortress Core</h1>
          <p className="text-slate-400 max-w-lg mx-auto text-base leading-relaxed">
            Configure the backbone of your backup infrastructure.
          </p>
        </div>

        <div className="flex w-full sm:w-fit items-center justify-between sm:justify-center gap-1 sm:gap-4 px-2 sm:px-6 py-4 bg-slate-900/30 backdrop-blur-md rounded-[2rem] border border-slate-800/50 mx-auto shadow-2xl">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isPast = getStepIndex(currentStep) > idx;

            return (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center gap-2 transition-all duration-300">
                  <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl border flex items-center justify-center transition-all duration-500 relative group ${isActive ? 'bg-indigo-600 border-indigo-400 text-white scale-110 shadow-[0_0_20px_rgba(79,70,229,0.3)]' :
                    isPast ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                      'bg-slate-800/50 border-slate-700/50 text-slate-500'
                    }`}>
                    {isPast ? <CheckCircle2 className="w-4 h-4 sm:w-6 sm:h-6" /> : <Icon className="w-4 h-4 sm:w-6 sm:h-6" />}
                  </div>
                  <span className={`text-[7px] sm:text-[8px] font-black uppercase sm:tracking-[0.2em] transition-colors ${isActive ? 'text-indigo-400' : 'text-slate-600'}`}>
                    {step.label}
                  </span>
                </div>
                {idx < steps.length - 1 && (
                  <div className={`hidden sm:block h-[1px] w-6 lg:w-12 transition-all duration-700 ${isPast ? 'bg-emerald-500/30' : 'bg-slate-800/50'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div className="bg-slate-900/60 backdrop-blur-2xl border border-slate-800/80 rounded-2xl sm:rounded-[3rem] p-4 sm:p-8 md:p-12 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] relative overflow-hidden sm:min-h-[600px] min-w-0 flex flex-col transition-all duration-500">

          {saveError && <p role="alert" className="mb-4 text-sm text-rose-400">{saveError}</p>}
          {/* STEP 1: DATABASE */}
          {currentStep === 'db' && (
            <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500 flex-1 flex flex-col">
              <div className="text-center">
                <h2 className="text-3xl font-black text-white mb-3">Persistent Storage Core</h2>
                <p className="text-slate-500 text-sm max-w-md mx-auto">The database engine is selected in the controller environment. Setup uses that active connection; switching engines requires a separate migration.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto w-full">
                <button
                  disabled={activeDbType !== DatabaseType.SQLITE}
                  onClick={() => setDbConfig({ type: DatabaseType.SQLITE })}
                  className={`relative p-8 rounded-[2.5rem] border flex flex-col items-center gap-5 transition-all duration-300 ${dbConfig.type === DatabaseType.SQLITE
                    ? 'bg-indigo-600/10 border-indigo-500 shadow-2xl'
                    : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                    }`}
                >
                  <div className="w-16 h-16 rounded-2xl bg-slate-900/80 flex items-center justify-center p-3 border border-slate-700/50 shadow-inner">
                    <Boxes className="text-indigo-400" size={32} />
                  </div>
                  <div className="text-center">
                    <h4 className="text-white font-bold text-lg">SQLite (Embedded)</h4>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Single-file zero-config storage</p>
                  </div>
                </button>

                <button
                  disabled={activeDbType !== DatabaseType.POSTGRES}
                  onClick={() => setDbConfig({ type: DatabaseType.POSTGRES, host: 'localhost', port: 5432, database: 'fortress' })}
                  className={`relative p-8 rounded-[2.5rem] border flex flex-col items-center gap-5 transition-all duration-300 ${dbConfig.type === DatabaseType.POSTGRES
                    ? 'bg-indigo-600/10 border-indigo-500 shadow-2xl'
                    : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                    }`}
                >
                  <div className="w-16 h-16 rounded-2xl bg-slate-900/80 flex items-center justify-center p-3 border border-slate-700/50 shadow-inner">
                    <Database className="text-blue-400" size={32} />
                  </div>
                  <div className="text-center">
                    <h4 className="text-white font-bold text-lg">PostgreSQL (External)</h4>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Enterprise distributed storage</p>
                  </div>
                </button>
              </div>

              {dbConfig.type === DatabaseType.POSTGRES && (
                <div className="max-w-4xl mx-auto w-full grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-slate-800/20 rounded-3xl border border-slate-800 animate-in slide-in-from-top-4 duration-300">
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Host</label>
                    <input type="text" value={dbConfig.host} onChange={e => setDbConfig({ ...dbConfig, host: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="db.internal.io" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Port</label>
                    <input type="number" value={dbConfig.port} onChange={e => setDbConfig({ ...dbConfig, port: parseInt(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="5432" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Database</label>
                    <input type="text" value={dbConfig.database} onChange={e => setDbConfig({ ...dbConfig, database: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="fortress" />
                  </div>
                  <div className="flex items-end col-span-full">
                    <button onClick={testDbConnection} className="text-[10px] font-black uppercase text-indigo-400 flex items-center gap-2 bg-indigo-500/5 px-4 py-2 rounded-lg border border-indigo-500/10 hover:bg-indigo-500/10 transition-colors">
                      {isDbTesting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      {isDbTesting ? 'Verifying TCP Handshake...' : 'Test Connection'}
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-auto flex justify-center pt-8 border-t border-slate-800/50">
                <button
                  onClick={() => setCurrentStep('auth')}
                  className="group flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white w-full sm:w-auto justify-center px-4 sm:px-12 py-4 sm:py-5 rounded-2xl text-xs sm:text-base font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 transition-all active:scale-95"
                >
                  Configure Identity <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: IDENTITY / AUTH MODE */}
          {currentStep === 'auth' && (
            <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500 flex-1 flex flex-col">
              <div className="text-center">
                <h2 className="text-3xl font-black text-white mb-3">Identity Orchestration</h2>
                <p className="text-slate-500 text-sm max-w-md mx-auto">Choose how users will authenticate to Fortress.</p>
              </div>

              {/* Auth Mode Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto w-full">
                <button
                  onClick={() => { setAuthMode('local'); setSsoConfig({ provider: null }); }}
                  className={`relative p-8 rounded-[2.5rem] border flex flex-col items-center gap-4 transition-all duration-300 ${authMode === 'local'
                    ? 'bg-emerald-600/10 border-emerald-500 shadow-2xl'
                    : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                    }`}
                >
                  <div className="w-16 h-16 rounded-2xl bg-slate-900/80 flex items-center justify-center p-4 border border-slate-700/50 shadow-inner">
                    <Lock className={authMode === 'local' ? 'text-emerald-400' : 'text-slate-400'} size={32} />
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-black text-white block">Local Email & Password</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Self-managed authentication</span>
                  </div>
                </button>

                <button
                  onClick={() => { setAuthMode('sso'); }}
                  className={`relative p-8 rounded-[2.5rem] border flex flex-col items-center gap-4 transition-all duration-300 ${authMode === 'sso'
                    ? 'bg-indigo-600/10 border-indigo-500 shadow-2xl'
                    : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                    }`}
                >
                  <div className="w-16 h-16 rounded-2xl bg-slate-900/80 flex items-center justify-center p-4 border border-slate-700/50 shadow-inner">
                    <Shield className={authMode === 'sso' ? 'text-indigo-400' : 'text-slate-400'} size={32} />
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-black text-white block">Enterprise SSO</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">GitHub OAuth</span>
                  </div>
                </button>
              </div>

              {/* Local Auth - Admin User Setup */}
              {authMode === 'local' && (
                <div className="max-w-2xl mx-auto w-full space-y-6 animate-in slide-in-from-top-4 duration-300">
                  <div className="p-6 bg-emerald-500/5 rounded-3xl border border-emerald-500/10">
                    <h4 className="text-[10px] font-black uppercase text-emerald-400 tracking-widest mb-4">Create Administrator Account</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Full Name</label>
                        <input type="text" value={adminName} onChange={e => setAdminName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none" placeholder="Admin User" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Email Address</label>
                        <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none" placeholder="admin@company.com" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Password</label>
                        <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none" placeholder="Min 12 characters" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Confirm Password</label>
                        <input type="password" value={adminConfirmPassword} onChange={e => setAdminConfirmPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none" placeholder="••••••••" />
                      </div>
                    </div>
                    {adminPassword && adminConfirmPassword && adminPassword !== adminConfirmPassword && (
                      <p className="text-rose-400 text-xs mt-4">Passwords do not match</p>
                    )}
                  </div>
                </div>
              )}

              {/* SSO Provider Selection */}
              {authMode === 'sso' && (
                <div className="space-y-6 animate-in slide-in-from-top-4 duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto w-full">
                    {[{ id: 'google', label: 'Google', icon: 'https://www.svgrepo.com/show/475656/google-color.svg' },
                    { id: 'github', label: 'GitHub', icon: 'github' },
                    { id: 'oidc', label: 'OIDC / SAML', icon: 'oidc' }
                    ].map((prov) => (
                      <button
                        key={prov.id}
                        disabled={prov.id !== 'github'}
                        title={prov.id === 'github' ? undefined : 'This provider is not implemented by the controller'}
                        onClick={() => setSsoConfig({ provider: prov.id as any })}
                        className={`relative p-5 rounded-2xl border flex flex-col items-center gap-3 transition-all ${ssoConfig.provider === prov.id
                          ? 'bg-indigo-600/10 border-indigo-500'
                          : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                          }`}
                      >
                        <div className="w-12 h-12 rounded-xl bg-slate-900/80 flex items-center justify-center p-2 border border-slate-700/50">
                          {prov.id === 'google' ? <img src={prov.icon} className="w-full h-full" /> :
                            prov.id === 'github' ? <Github className="text-white" size={28} /> : <Globe className="text-indigo-400" size={28} />}
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">{prov.label}{prov.id !== 'github' && ' (unavailable)'}</span>
                      </button>
                    ))}
                  </div>

                  {ssoConfig.provider && (
                    <div className="max-w-3xl mx-auto w-full p-6 bg-slate-800/20 rounded-3xl border border-slate-800">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Client ID</label>
                          <input type="text" value={ssoConfig.clientId || ''} onChange={e => setSsoConfig({ ...ssoConfig, clientId: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono" placeholder="oauth-client-id" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Client Secret</label>
                          <input type="password" value={ssoConfig.clientSecret || ''} onChange={e => setSsoConfig({ ...ssoConfig, clientSecret: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono" placeholder="••••••••" />
                        </div>
                        {ssoConfig.provider === 'oidc' && (
                        <div className="space-y-2 md:col-span-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Discovery URL</label>
                            <input type="text" value={ssoConfig.discoveryUrl || ''} onChange={e => setSsoConfig({ ...ssoConfig, discoveryUrl: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono" placeholder="https://auth.company.com/.well-known/openid-configuration" />
                          </div>
                        )}
                      </div>
                      <div className="mt-4 p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-4">
                        <code className="flex-1 text-[10px] font-mono text-indigo-300 truncate">Redirect URI: {redirectUri}</code>
                        <button aria-label="Copy redirect URI" onClick={() => void copyText(redirectUri).then(() => toast.success('Redirect URI copied')).catch(error => toast.error(error.message))} className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-white"><Copy size={14} /></button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-auto flex flex-col-reverse sm:flex-row gap-4 justify-between items-center pt-6 sm:pt-8 border-t border-slate-800/50">
                <button onClick={() => setCurrentStep('db')} className="text-slate-600 hover:text-white font-black text-[11px] uppercase tracking-[0.2em]">Back</button>
                <button
                  disabled={!authMode || (authMode === 'local' && (!adminName.trim() || !adminEmail.includes('@') || !adminPassword || adminPassword !== adminConfirmPassword || adminPassword.length < 12)) || (authMode === 'sso' && (ssoConfig.provider !== 'github' || !ssoConfig.clientId || !ssoConfig.clientSecret))}
                  onClick={() => setCurrentStep('welcome')}
                  className="group flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white w-full sm:w-auto justify-center px-4 sm:px-12 py-4 sm:py-5 rounded-2xl text-xs sm:text-base font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 transition-all active:scale-95"
                >
                  Configure Systems <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {/* OTHER STEPS REMAIN SIMILAR */}
          {currentStep === 'welcome' && (
            <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500 flex-1 flex flex-col">
              <div className="text-center space-y-3">
                <div className="w-20 h-20 bg-indigo-600/20 rounded-[2rem] flex items-center justify-center mx-auto border border-indigo-500/20 mb-4 shadow-inner">
                  <Boxes size={40} className="text-indigo-400" />
                </div>
                <h2 className="text-3xl font-black text-white">Choose Your Backup Arsenal</h2>
                <p className="text-slate-500 text-sm max-w-md mx-auto font-medium uppercase tracking-tight">Select engines to initialize management profiles.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto w-full">
                {['borg', 'restic', 'rsync'].map((tool) => (
                  <button
                    key={tool}
                    onClick={() => toggleTool(tool)}
                    className={`group relative p-6 rounded-[2rem] border transition-all duration-300 text-left overflow-hidden ${selectedTools.includes(tool)
                      ? 'bg-indigo-600/10 border-indigo-500/50 shadow-xl'
                      : 'bg-slate-800/30 border-slate-700/50 hover:border-slate-600'
                      }`}
                  >
                    <div className="relative z-10">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-colors ${selectedTools.includes(tool) ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                        <Database size={20} />
                      </div>
                      <h4 className="text-lg font-black text-white capitalize mb-1">{tool}</h4>
                      <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest leading-tight">{guides[tool].desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-auto flex flex-col-reverse sm:flex-row gap-4 justify-between items-center pt-6 sm:pt-8 border-t border-slate-800/50">
                <button onClick={() => setCurrentStep('auth')} className="text-slate-600 hover:text-white font-black text-[11px] uppercase tracking-[0.2em]">Back</button>
                <button
                  disabled={selectedTools.length === 0}
                  onClick={() => setCurrentStep('vault')}
                  className="group flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white w-full sm:w-auto justify-center px-4 sm:px-12 py-4 sm:py-5 rounded-2xl text-xs sm:text-base font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 transition-all active:scale-95"
                >
                  Setup Vault <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {currentStep === 'vault' && (
            <div className="space-y-8 flex-1 flex flex-col">
              <div className="text-center">
                <h2 className="text-3xl font-black text-white mb-3">Controller Credential Vault</h2>
                <p className="text-slate-400 text-sm max-w-lg mx-auto">The controller encrypts saved storage credentials and SSH identities with server-held keys. These keys are generated during setup and persisted with the controller configuration.</p>
              </div>
              <p className="text-sm text-slate-400 max-w-lg mx-auto">Your administrator sign-in password controls access to the interface. Back up the protected runtime configuration together with the database so saved credentials can be recovered.</p>
              <div className="mt-auto flex flex-col-reverse sm:flex-row gap-4 justify-between items-center pt-6 border-t border-slate-800/50">
                <button onClick={() => setCurrentStep('welcome')} className="text-slate-400 py-3">Back</button>
                <button onClick={() => setCurrentStep('ai')} className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-indigo-600 text-white font-bold">Configure AI</button>
              </div>
            </div>
          )}

          {currentStep === 'ai' && (
            <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500 flex-1 flex flex-col">
              <div className="text-center">
                <h2 className="text-3xl font-black text-white mb-3">Intelligent Orchestration</h2>
                <p className="text-slate-500 text-sm max-w-md mx-auto">Optional: Configure an AI provider to assist with complex backup scheduling and retention planning.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto w-full">
                {[
                  { id: AIProvider.NONE, label: 'No AI Assist', icon: XCircle },
                  { id: AIProvider.GEMINI, label: 'Google Gemini', icon: Sparkles },
                  { id: AIProvider.OPENAI, label: 'OpenAI / Custom', icon: Globe }
                ].map((prov) => (
                  <button
                    key={prov.id}
                    onClick={() => setAiConfig({ ...aiConfig, provider: prov.id })}
                    className={`relative p-8 rounded-[2.5rem] border flex flex-col items-center gap-5 transition-all duration-300 ${aiConfig.provider === prov.id
                      ? 'bg-indigo-600/10 border-indigo-500 shadow-xl'
                      : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                      }`}
                  >
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-inner ${aiConfig.provider === prov.id ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-slate-900 text-slate-600 border-slate-700'}`}>
                      <prov.icon size={32} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">{prov.label}</span>
                  </button>
                ))}
              </div>

              <div className="mt-auto flex flex-col-reverse sm:flex-row gap-4 justify-between items-center pt-6 sm:pt-8 border-t border-slate-800/50">
                <button onClick={() => setCurrentStep('vault')} className="text-slate-600 hover:text-white font-black text-[11px] uppercase tracking-[0.2em]">Back</button>
                <button
                  onClick={() => setCurrentStep('guide')}
                  className="group flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white w-full sm:w-auto justify-center px-4 sm:px-12 py-4 sm:py-5 rounded-2xl text-xs sm:text-base font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 transition-all active:scale-95"
                >
                  Final Preparation <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {currentStep === 'guide' && (
            <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500 flex-1 flex flex-col">
              <div className="text-center">
                <h2 className="text-3xl font-black text-white mb-3">Infrastructure Preparation</h2>
                <p className="text-slate-500 text-sm max-w-md mx-auto">Prepare your remote systems for management.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 flex-1">
                <div className="md:col-span-4 space-y-3">
                  {selectedTools.map(toolId => (
                    <button
                      key={toolId}
                      onClick={() => setActiveGuideTool(toolId)}
                      className={`w-full p-4 rounded-[1.5rem] border flex items-center gap-4 transition-all duration-300 ${activeGuideTool === toolId ? 'bg-indigo-600/10 border-indigo-500/50 text-indigo-400' : 'bg-slate-800/20 border-slate-800 text-slate-500'
                        }`}
                    >
                      <span className="text-[10px] font-black uppercase tracking-widest">{toolId}</span>
                    </button>
                  ))}
                </div>

                <div className="md:col-span-8 bg-slate-950/40 border border-slate-800/80 rounded-[2.5rem] p-8 shadow-inner">
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xl font-black text-white">{guides[activeGuideTool].title}</h3>
                      <p className="text-xs text-slate-500 mt-1 uppercase font-bold">{guides[activeGuideTool].desc}</p>
                    </div>
                    <div className="space-y-4">
                      {guides[activeGuideTool].steps.map((step: string, i: number) => (
                        <div key={i} className="flex gap-4 items-start">
                          <div className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-black text-indigo-400 flex-shrink-0 mt-0.5">{i + 1}</div>
                          <p className="text-[12px] text-slate-300 leading-relaxed font-medium">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-auto flex flex-col-reverse sm:flex-row gap-4 justify-between items-center pt-6 sm:pt-8 border-t border-slate-800/50">
                <button onClick={() => setCurrentStep('ai')} className="text-slate-600 hover:text-white font-black text-[11px] uppercase tracking-[0.2em]">Back</button>
                <button
                  disabled={saving} onClick={handleFinish}
                  className="group flex items-center gap-3 bg-emerald-600 hover:bg-emerald-500 text-white w-full sm:w-auto justify-center px-4 sm:px-14 py-4 sm:py-5 rounded-2xl text-xs sm:text-base font-black uppercase tracking-[0.2em] shadow-2xl shadow-emerald-600/30 transition-all active:scale-95"
                >
                  {saving ? 'Saving...' : 'Enter Command Center'} <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
