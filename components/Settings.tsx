import React, { useState } from 'react';
import {
    Settings as SettingsIcon, Brain, Database, Shield, Key,
    Save, RefreshCw, Loader2, CheckCircle2, AlertTriangle,
    Download, Upload, Trash2, X, Sparkles, Globe, XCircle,
    Lock, Eye, EyeOff, Copy, ExternalLink
} from 'lucide-react';
import { AIConfig, AIProvider, DatabaseConfig, DatabaseType, SSOConfig } from '../types';

interface SettingsProps {
    aiConfig: AIConfig;
    dbConfig: DatabaseConfig | null;
    ssoConfig: SSOConfig | null;
    onUpdateAIConfig: (config: AIConfig) => void;
    onUpdateDBConfig: (config: DatabaseConfig) => void;
    onUpdateSSOConfig: (config: SSOConfig) => void;
    onResetApp: () => void;
    onExportData: () => void;
    onImportData: (data: string) => void;
}

type SettingsTab = 'ai' | 'database' | 'sso' | 'security' | 'data';

export const Settings: React.FC<SettingsProps> = ({
    aiConfig,
    dbConfig,
    ssoConfig,
    onUpdateAIConfig,
    onUpdateDBConfig,
    onUpdateSSOConfig,
    onResetApp,
    onExportData,
    onImportData
}) => {
    const [activeTab, setActiveTab] = useState<SettingsTab>('ai');
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // AI Config State
    const [localAIConfig, setLocalAIConfig] = useState<AIConfig>(aiConfig);
    const [showApiKey, setShowApiKey] = useState(false);

    // DB Config State
    const [localDBConfig, setLocalDBConfig] = useState<DatabaseConfig>(dbConfig || { type: DatabaseType.SQLITE });
    const [isDbTesting, setIsDbTesting] = useState(false);

    // SSO Config State
    const [localSSOConfig, setLocalSSOConfig] = useState<SSOConfig>(ssoConfig || { provider: null });
    const [showClientSecret, setShowClientSecret] = useState(false);

    // Security State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Import State
    const [importData, setImportData] = useState('');
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    const tabs = [
        { id: 'ai', label: 'AI Configuration', icon: Brain },
        { id: 'database', label: 'Database', icon: Database },
        { id: 'sso', label: 'SSO / Identity', icon: Shield },
        { id: 'security', label: 'Security', icon: Lock },
        { id: 'data', label: 'Data Management', icon: SettingsIcon },
    ];

    const handleSave = async (type: 'ai' | 'db' | 'sso') => {
        setIsSaving(true);
        setSaveSuccess(false);

        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate save

        if (type === 'ai') onUpdateAIConfig(localAIConfig);
        if (type === 'db') onUpdateDBConfig(localDBConfig);
        if (type === 'sso') onUpdateSSOConfig(localSSOConfig);

        setIsSaving(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
    };

    const testDbConnection = () => {
        setIsDbTesting(true);
        setTimeout(() => setIsDbTesting(false), 1500);
    };

    const handleExport = () => {
        onExportData();
    };

    const handleImport = () => {
        if (importData) {
            onImportData(importData);
            setImportData('');
        }
    };

    const redirectUri = window.location.origin + '/';

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black text-white tracking-tight">System Configuration</h2>
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">Fortress Control Parameters</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 p-2 bg-slate-900/40 rounded-2xl border border-slate-800/50">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as SettingsTab)}
                            className={`flex items-center gap-3 px-5 py-3 rounded-xl transition-all ${isActive
                                    ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                                }`}
                        >
                            <Icon size={18} />
                            <span className="text-xs font-bold uppercase tracking-wider">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-[2.5rem] p-10">

                {/* AI Configuration Tab */}
                {activeTab === 'ai' && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="p-4 bg-indigo-600/10 rounded-2xl border border-indigo-500/20">
                                <Brain className="text-indigo-400" size={28} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white">AI Orchestration Engine</h3>
                                <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">Intelligent backup planning assistant</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[
                                { id: AIProvider.NONE, label: 'Disabled', icon: XCircle, desc: 'No AI assistance' },
                                { id: AIProvider.GEMINI, label: 'Google Gemini', icon: Sparkles, desc: 'Google AI models' },
                                { id: AIProvider.OPENAI, label: 'OpenAI / Custom', icon: Globe, desc: 'GPT or compatible APIs' }
                            ].map((prov) => (
                                <button
                                    key={prov.id}
                                    onClick={() => setLocalAIConfig({ ...localAIConfig, provider: prov.id })}
                                    className={`relative p-6 rounded-2xl border flex flex-col items-center gap-4 transition-all ${localAIConfig.provider === prov.id
                                            ? 'bg-indigo-600/10 border-indigo-500 shadow-xl'
                                            : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                                        }`}
                                >
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-inner ${localAIConfig.provider === prov.id
                                            ? 'bg-indigo-600 text-white border-indigo-400'
                                            : 'bg-slate-900 text-slate-600 border-slate-700'
                                        }`}>
                                        <prov.icon size={24} />
                                    </div>
                                    <div className="text-center">
                                        <span className="text-sm font-bold text-white block">{prov.label}</span>
                                        <span className="text-[10px] text-slate-500 uppercase tracking-widest">{prov.desc}</span>
                                    </div>
                                </button>
                            ))}
                        </div>

                        {localAIConfig.provider !== AIProvider.NONE && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 bg-slate-800/20 rounded-3xl border border-slate-800 animate-in slide-in-from-top-4 duration-300">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">API Key</label>
                                    <div className="relative">
                                        <input
                                            type={showApiKey ? "text" : "password"}
                                            value={localAIConfig.apiKey || ''}
                                            onChange={e => setLocalAIConfig({ ...localAIConfig, apiKey: e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono pr-12"
                                            placeholder="sk-..."
                                        />
                                        <button
                                            onClick={() => setShowApiKey(!showApiKey)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                                        >
                                            {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Model</label>
                                    <input
                                        type="text"
                                        value={localAIConfig.model || ''}
                                        onChange={e => setLocalAIConfig({ ...localAIConfig, model: e.target.value })}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                                        placeholder={localAIConfig.provider === AIProvider.GEMINI ? "gemini-2.0-flash" : "gpt-4o"}
                                    />
                                </div>

                                {localAIConfig.provider === AIProvider.OPENAI && (
                                    <div className="space-y-2 col-span-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Base URL (Optional)</label>
                                        <input
                                            type="text"
                                            value={localAIConfig.baseUrl || ''}
                                            onChange={e => setLocalAIConfig({ ...localAIConfig, baseUrl: e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono"
                                            placeholder="https://api.openai.com/v1"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end">
                            <button
                                onClick={() => handleSave('ai')}
                                disabled={isSaving}
                                className="flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 size={16} className="animate-spin" /> : saveSuccess ? <CheckCircle2 size={16} /> : <Save size={16} />}
                                {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Database Tab */}
                {activeTab === 'database' && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="p-4 bg-blue-600/10 rounded-2xl border border-blue-500/20">
                                <Database className="text-blue-400" size={28} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white">Persistent Storage Core</h3>
                                <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">Job history and metadata storage</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <button
                                onClick={() => setLocalDBConfig({ type: DatabaseType.SQLITE })}
                                className={`relative p-8 rounded-2xl border flex flex-col items-center gap-5 transition-all ${localDBConfig.type === DatabaseType.SQLITE
                                        ? 'bg-indigo-600/10 border-indigo-500 shadow-xl'
                                        : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                                    }`}
                            >
                                <div className="text-center">
                                    <h4 className="text-white font-bold text-lg">SQLite (Embedded)</h4>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Zero-config local storage</p>
                                </div>
                            </button>

                            <button
                                onClick={() => setLocalDBConfig({ type: DatabaseType.POSTGRES, host: 'localhost', port: 5432, database: 'fortress' })}
                                className={`relative p-8 rounded-2xl border flex flex-col items-center gap-5 transition-all ${localDBConfig.type === DatabaseType.POSTGRES
                                        ? 'bg-indigo-600/10 border-indigo-500 shadow-xl'
                                        : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                                    }`}
                            >
                                <div className="text-center">
                                    <h4 className="text-white font-bold text-lg">PostgreSQL (External)</h4>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Enterprise distributed storage</p>
                                </div>
                            </button>
                        </div>

                        {localDBConfig.type === DatabaseType.POSTGRES && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-slate-800/20 rounded-3xl border border-slate-800 animate-in slide-in-from-top-4 duration-300">
                                <div className="space-y-1 col-span-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Host</label>
                                    <input type="text" value={localDBConfig.host} onChange={e => setLocalDBConfig({ ...localDBConfig, host: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="db.internal.io" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Port</label>
                                    <input type="number" value={localDBConfig.port} onChange={e => setLocalDBConfig({ ...localDBConfig, port: parseInt(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="5432" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Database</label>
                                    <input type="text" value={localDBConfig.database} onChange={e => setLocalDBConfig({ ...localDBConfig, database: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="fortress" />
                                </div>
                                <div className="flex items-end col-span-4">
                                    <button onClick={testDbConnection} className="text-[10px] font-black uppercase text-indigo-400 flex items-center gap-2 bg-indigo-500/5 px-4 py-2 rounded-lg border border-indigo-500/10 hover:bg-indigo-500/10 transition-colors">
                                        {isDbTesting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                        {isDbTesting ? 'Testing...' : 'Test Connection'}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end">
                            <button
                                onClick={() => handleSave('db')}
                                disabled={isSaving}
                                className="flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                )}

                {/* SSO Tab */}
                {activeTab === 'sso' && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="p-4 bg-emerald-600/10 rounded-2xl border border-emerald-500/20">
                                <Shield className="text-emerald-400" size={28} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white">Identity Provider</h3>
                                <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">SSO authentication configuration</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[
                                { id: 'google', label: 'Google Workspace', icon: '🔵' },
                                { id: 'github', label: 'GitHub Enterprise', icon: '⚫' },
                                { id: 'oidc', label: 'Custom OIDC', icon: '🔷' }
                            ].map((prov) => (
                                <button
                                    key={prov.id}
                                    onClick={() => setLocalSSOConfig({ ...localSSOConfig, provider: prov.id as any })}
                                    className={`relative p-6 rounded-2xl border flex flex-col items-center gap-4 transition-all ${localSSOConfig.provider === prov.id
                                            ? 'bg-indigo-600/10 border-indigo-500 shadow-xl'
                                            : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                                        }`}
                                >
                                    <span className="text-3xl">{prov.icon}</span>
                                    <span className="text-sm font-bold text-white">{prov.label}</span>
                                </button>
                            ))}
                        </div>

                        {localSSOConfig.provider && (
                            <div className="space-y-6 p-8 bg-slate-800/20 rounded-3xl border border-slate-800 animate-in slide-in-from-top-4 duration-300">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Client ID</label>
                                        <input
                                            type="text"
                                            value={localSSOConfig.clientId || ''}
                                            onChange={e => setLocalSSOConfig({ ...localSSOConfig, clientId: e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono"
                                            placeholder="oauth-client-id"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Client Secret</label>
                                        <div className="relative">
                                            <input
                                                type={showClientSecret ? "text" : "password"}
                                                value={localSSOConfig.clientSecret || ''}
                                                onChange={e => setLocalSSOConfig({ ...localSSOConfig, clientSecret: e.target.value })}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono pr-12"
                                                placeholder="••••••••"
                                            />
                                            <button
                                                onClick={() => setShowClientSecret(!showClientSecret)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                                            >
                                                {showClientSecret ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                    </div>
                                    {localSSOConfig.provider === 'oidc' && (
                                        <div className="space-y-2 col-span-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Discovery URL</label>
                                            <input
                                                type="text"
                                                value={localSSOConfig.discoveryUrl || ''}
                                                onChange={e => setLocalSSOConfig({ ...localSSOConfig, discoveryUrl: e.target.value })}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono"
                                                placeholder="https://auth.company.com/.well-known/openid-configuration"
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
                                    <p className="text-xs text-slate-400 mb-2">Configure this <strong>Redirect URI</strong> in your provider:</p>
                                    <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                                        <code className="flex-1 text-xs font-mono text-indigo-300 truncate">{redirectUri}</code>
                                        <button
                                            onClick={() => navigator.clipboard.writeText(redirectUri)}
                                            className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-white transition-colors"
                                        >
                                            <Copy size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end">
                            <button
                                onClick={() => handleSave('sso')}
                                disabled={isSaving}
                                className="flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Security Tab */}
                {activeTab === 'security' && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="p-4 bg-rose-600/10 rounded-2xl border border-rose-500/20">
                                <Lock className="text-rose-400" size={28} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white">Vault Security</h3>
                                <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">Master password management</p>
                            </div>
                        </div>

                        <div className="max-w-md mx-auto space-y-6 p-8 bg-slate-800/20 rounded-3xl border border-slate-800">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Current Password</label>
                                <input
                                    type="password"
                                    value={currentPassword}
                                    onChange={e => setCurrentPassword(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                                    placeholder="••••••••"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">New Password</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                                    placeholder="••••••••"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Confirm New Password</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                                    placeholder="••••••••"
                                />
                            </div>

                            {newPassword && confirmPassword && newPassword !== confirmPassword && (
                                <p className="text-rose-400 text-xs font-bold flex items-center gap-2">
                                    <AlertTriangle size={14} /> Passwords do not match
                                </p>
                            )}

                            <button
                                disabled={!currentPassword || !newPassword || newPassword !== confirmPassword || newPassword.length < 8}
                                className="w-full py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-xl shadow-rose-600/20 transition-all active:scale-95 disabled:opacity-50"
                            >
                                Update Master Password
                            </button>
                        </div>

                        <div className="p-6 bg-amber-500/5 rounded-2xl border border-amber-500/10">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="text-amber-400 mt-0.5" size={18} />
                                <div>
                                    <h4 className="text-sm font-bold text-amber-400">Warning</h4>
                                    <p className="text-xs text-slate-400 mt-1">Changing your master password will require re-encrypting all stored SSH keys. This operation cannot be undone.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Data Management Tab */}
                {activeTab === 'data' && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="p-4 bg-slate-600/10 rounded-2xl border border-slate-500/20">
                                <SettingsIcon className="text-slate-400" size={28} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white">Data Management</h3>
                                <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">Export, import, and reset</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Export */}
                            <div className="p-8 bg-slate-800/20 rounded-3xl border border-slate-800 space-y-4">
                                <div className="flex items-center gap-3 text-emerald-400">
                                    <Download size={20} />
                                    <h4 className="text-sm font-bold uppercase tracking-widest">Export Configuration</h4>
                                </div>
                                <p className="text-xs text-slate-500">Download all systems, jobs, and locations as a JSON file. SSH keys are excluded for security.</p>
                                <button
                                    onClick={handleExport}
                                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-xl shadow-emerald-600/20 transition-all active:scale-95"
                                >
                                    Export Data
                                </button>
                            </div>

                            {/* Import */}
                            <div className="p-8 bg-slate-800/20 rounded-3xl border border-slate-800 space-y-4">
                                <div className="flex items-center gap-3 text-blue-400">
                                    <Upload size={20} />
                                    <h4 className="text-sm font-bold uppercase tracking-widest">Import Configuration</h4>
                                </div>
                                <textarea
                                    value={importData}
                                    onChange={e => setImportData(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono h-24 resize-none"
                                    placeholder="Paste exported JSON here..."
                                />
                                <button
                                    onClick={handleImport}
                                    disabled={!importData}
                                    className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-600/20 transition-all active:scale-95 disabled:opacity-50"
                                >
                                    Import Data
                                </button>
                            </div>
                        </div>

                        {/* Reset */}
                        <div className="p-8 bg-rose-500/5 rounded-3xl border border-rose-500/10 space-y-4">
                            <div className="flex items-center gap-3 text-rose-400">
                                <Trash2 size={20} />
                                <h4 className="text-sm font-bold uppercase tracking-widest">Danger Zone</h4>
                            </div>
                            <p className="text-xs text-slate-400">Reset all settings and data. This will clear everything including SSH keys, jobs, systems, and locations. This action cannot be undone.</p>

                            {!showResetConfirm ? (
                                <button
                                    onClick={() => setShowResetConfirm(true)}
                                    className="py-4 px-8 bg-rose-600/10 hover:bg-rose-600 text-rose-400 hover:text-white rounded-xl font-black uppercase tracking-widest text-xs border border-rose-500/20 transition-all"
                                >
                                    Reset Application
                                </button>
                            ) : (
                                <div className="flex items-center gap-4 animate-in slide-in-from-left duration-300">
                                    <button
                                        onClick={() => { onResetApp(); setShowResetConfirm(false); }}
                                        className="py-4 px-8 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-xl shadow-rose-600/20 transition-all"
                                    >
                                        Confirm Reset
                                    </button>
                                    <button
                                        onClick={() => setShowResetConfirm(false)}
                                        className="py-4 px-8 text-slate-500 hover:text-white"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
