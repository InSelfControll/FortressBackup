import React, { useState } from 'react';
import {
    Brain, Database, Shield, Lock, Settings as SettingsIcon
} from 'lucide-react';
import { AIConfig, DatabaseConfig, SSOConfig } from '../types';
import { AIConfigTab } from './settings/AIConfigTab';
import { DatabaseConfigTab } from './settings/DatabaseConfigTab';
import { SSOConfigTab } from './settings/SSOConfigTab';
import { SecurityTab } from './settings/SecurityTab';
import { DataManagementTab } from './settings/DataManagementTab';

interface SettingsProps {
    authMode?: 'local' | 'sso';
    onUpdateAuthMode?: (mode: 'local' | 'sso') => void | Promise<void>;
    aiConfig: AIConfig;
    dbConfig: DatabaseConfig | null;
    ssoConfig: SSOConfig | null;
    onUpdateAIConfig: (config: AIConfig) => void | Promise<void>;
    onUpdateDBConfig: (config: DatabaseConfig) => void | Promise<void>;
    onUpdateSSOConfig: (config: SSOConfig) => void | Promise<void>;
    onResetApp: () => void | Promise<void>;
    onExportData: () => void | Promise<void>;
    onImportData: (data: string) => void | Promise<void>;
}

type SettingsTab = 'ai' | 'database' | 'sso' | 'security' | 'data';

export const Settings: React.FC<SettingsProps> = ({
    aiConfig,
    authMode,
    onUpdateAuthMode,
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

    const tabs = [
        { id: 'ai', label: 'AI Configuration', icon: Brain },
        { id: 'database', label: 'Database', icon: Database },
        { id: 'sso', label: 'SSO / Identity', icon: Shield },
        { id: 'security', label: 'Security', icon: Lock },
        { id: 'data', label: 'Data Management', icon: SettingsIcon },
    ];

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black text-white tracking-tight">System Configuration</h2>
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">Fortress Control Parameters</p>
                </div>
            </div>

            {/* Tabs */}
            <div aria-label="Settings sections" className="flex overflow-x-auto gap-2 p-2 bg-slate-900/40 rounded-2xl border border-slate-800/50">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as SettingsTab)}
                            className={`flex shrink-0 items-center gap-3 px-4 sm:px-5 py-3 rounded-xl transition-all ${isActive
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
            <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/60 rounded-2xl sm:rounded-[2.5rem] min-w-0 p-4 sm:p-10">
                {activeTab === 'ai' && (
                    <AIConfigTab config={aiConfig} onUpdate={onUpdateAIConfig} />
                )}

                {activeTab === 'database' && (
                    <DatabaseConfigTab config={dbConfig} onUpdate={onUpdateDBConfig} />
                )}

                {activeTab === 'sso' && (
                    <SSOConfigTab config={ssoConfig} onUpdate={onUpdateSSOConfig} authMode={authMode} onUpdateAuthMode={onUpdateAuthMode} />
                )}

                {activeTab === 'security' && (
                    <SecurityTab />
                )}

                {activeTab === 'data' && (
                    <DataManagementTab
                        onExport={onExportData}
                        onImport={onImportData}
                        onReset={onResetApp}
                    />
                )}
            </div>
        </div>
    );
};
