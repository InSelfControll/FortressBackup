import React, { useState } from 'react';
import { 
  Shield, Key, Server, Check, ArrowRight, Github, 
  ShieldCheck, Lock, Terminal, Info, Zap, Database, ExternalLink,
  ChevronRight, Circle, CheckCircle2, Layout, Boxes, Cpu, Plus, Sparkles, Globe, Brain,
  XCircle
} from 'lucide-react';
import { AIProvider, AIConfig } from '../types';

interface SetupProps {
  onComplete: (masterPassword: string, aiConfig: AIConfig) => void;
}

type SetupStep = 'auth' | 'welcome' | 'vault' | 'ai' | 'guide';

export const Setup: React.FC<SetupProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState<SetupStep>('auth');
  const [ssoProvider, setSsoProvider] = useState<'google' | 'github' | 'oidc' | null>(null);
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>(['borg']);
  const [activeGuideTool, setActiveGuideTool] = useState<string>('borg');

  // AI Configuration State
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    provider: AIProvider.NONE,
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: ''
  });

  const steps = [
    { id: 'auth', label: 'Identity', icon: Shield },
    { id: 'welcome', label: 'Systems', icon: Layout },
    { id: 'vault', label: 'Vault', icon: Lock },
    { id: 'ai', label: 'AI intelligence', icon: Brain },
    { id: 'guide', label: 'Infrastructure', icon: Terminal },
  ];

  const toggleTool = (tool: string) => {
    setSelectedTools(prev => 
      prev.includes(tool) ? prev.filter(t => t !== tool) : [...prev, tool]
    );
    setActiveGuideTool(tool);
  };

  const handleFinish = () => {
    onComplete(masterPassword, aiConfig);
  };

  const guides: Record<string, any> = {
    borg: {
      title: 'BorgBackup Configuration',
      desc: 'Deduplicating, compressing, and authenticating archiver.',
      steps: [
        'Install Borg on source: `sudo apt install borgbackup`',
        'Initialize repo on destination: `borg init --encryption=repokey-blake2 /path/to/repo`',
        'Add the destination system in "Systems" with an SSH key.',
        'Create a Job and select BorgBackup as the engine.'
      ]
    },
    restic: {
      title: 'Restic Cloud Backup',
      desc: 'Fast, secure, efficient backup tool for cloud backends.',
      steps: [
        'Download restic binary to your source machine.',
        'Setup S3/B2 keys in environment variables.',
        'Initialize: `restic -r s3:s3.amazonaws.com/bucket init`',
        'Configure "Locations" in Fortress to match your backend.'
      ]
    },
    rsync: {
      title: 'Rsync Over SSH',
      desc: 'The classic file sync engine for 1:1 mirroring.',
      steps: [
        'Ensure `rsync` is installed on both source and target.',
        'Copy your Fortress public key to the target’s `authorized_keys`.',
        'Test the connection manually once: `ssh user@host rsync --version`',
        'Create a Job selecting Rsync in Fortress.'
      ]
    }
  };

  const getStepIndex = (id: string) => steps.findIndex(s => s.id === id);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-indigo-600/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] bg-blue-600/10 rounded-full blur-[140px]" />
      </div>

      <div className="relative z-10 w-full max-w-5xl flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-widest mb-2 shadow-sm">
            <Zap size={14} className="fill-current" /> System Initialization Sequence
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter leading-tight">Fortress Orchestrator</h1>
          <p className="text-slate-400 max-w-lg mx-auto text-base leading-relaxed">
            Enterprise backup management, simplified.
          </p>
        </div>

        <div className="flex items-center justify-center gap-4 px-6 py-4 bg-slate-900/30 backdrop-blur-md rounded-[2rem] border border-slate-800/50 w-fit mx-auto shadow-2xl">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isPast = getStepIndex(currentStep) > idx;

            return (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center gap-2 transition-all duration-300">
                  <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center transition-all duration-500 relative group ${
                    isActive ? 'bg-indigo-600 border-indigo-400 text-white scale-110 shadow-[0_0_20px_rgba(79,70,229,0.3)]' : 
                    isPast ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 
                    'bg-slate-800/50 border-slate-700/50 text-slate-500'
                  }`}>
                    {isPast ? <CheckCircle2 size={24} /> : <Icon size={24} />}
                  </div>
                  <span className={`text-[8px] font-black uppercase tracking-[0.2em] transition-colors ${isActive ? 'text-indigo-400' : 'text-slate-600'}`}>
                    {step.label}
                  </span>
                </div>
                {idx < steps.length - 1 && (
                  <div className={`h-[1px] w-12 transition-all duration-700 ${isPast ? 'bg-emerald-500/30' : 'bg-slate-800/50'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div className="bg-slate-900/60 backdrop-blur-2xl border border-slate-800/80 rounded-[3rem] p-8 md:p-12 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] relative overflow-hidden min-h-[550px] flex flex-col transition-all duration-500">
          
          {currentStep === 'auth' && (
            <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500 flex-1 flex flex-col">
              <div className="text-center">
                <h2 className="text-3xl font-black text-white mb-3">Enterprise SSO Integration</h2>
                <p className="text-slate-500 text-sm max-w-md mx-auto">Link your corporate identity provider to establish ownership.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto w-full">
                {/* Google Provider */}
                <button
                  onClick={() => setSsoProvider('google')}
                  className={`relative p-8 rounded-[2.5rem] border flex flex-col items-center gap-5 transition-all duration-300 ${
                    ssoProvider === 'google' 
                      ? 'bg-indigo-600/10 border-indigo-500 shadow-2xl' 
                      : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="w-16 h-16 rounded-2xl bg-slate-900/80 flex items-center justify-center p-3 border border-slate-700/50 shadow-inner">
                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-full h-full" alt="Google" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Sign in with Google</span>
                </button>

                {/* GitHub Provider */}
                <button
                  onClick={() => setSsoProvider('github')}
                  className={`relative p-8 rounded-[2.5rem] border flex flex-col items-center gap-5 transition-all duration-300 ${
                    ssoProvider === 'github' 
                      ? 'bg-indigo-600/10 border-indigo-500 shadow-2xl' 
                      : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="w-16 h-16 rounded-2xl bg-slate-900/80 flex items-center justify-center p-3 border border-slate-700/50 shadow-inner">
                    <Github className="text-white" size={32} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Sign in with GitHub</span>
                </button>

                {/* Custom OIDC Provider */}
                <button
                  onClick={() => setSsoProvider('oidc')}
                  className={`relative p-8 rounded-[2.5rem] border flex flex-col items-center gap-5 transition-all duration-300 ${
                    ssoProvider === 'oidc' 
                      ? 'bg-indigo-600/10 border-indigo-500 shadow-2xl' 
                      : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="w-16 h-16 rounded-2xl bg-slate-900/80 flex items-center justify-center p-3 border border-slate-700/50 shadow-inner">
                    <Cpu className="text-indigo-400" size={32} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Custom OIDC / SAML</span>
                </button>
              </div>
              <div className="mt-auto flex justify-center pt-8 border-t border-slate-800/50">
                <button
                  disabled={!ssoProvider}
                  onClick={() => setCurrentStep('welcome')}
                  className="group flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-12 py-5 rounded-2xl font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 transition-all active:scale-95"
                >
                  Configure Systems <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

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
                    className={`group relative p-6 rounded-[2rem] border transition-all duration-300 text-left overflow-hidden ${
                      selectedTools.includes(tool) 
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

              <div className="mt-auto flex justify-between items-center pt-8 border-t border-slate-800/50">
                <button onClick={() => setCurrentStep('auth')} className="text-slate-600 hover:text-white font-black text-[11px] uppercase tracking-[0.2em]">Back</button>
                <button
                  disabled={selectedTools.length === 0}
                  onClick={() => setCurrentStep('vault')}
                  className="group flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-12 py-5 rounded-2xl font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 transition-all active:scale-95"
                >
                  Setup Vault <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {currentStep === 'vault' && (
            <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500 flex-1 flex flex-col">
              <div className="text-center">
                <h2 className="text-3xl font-black text-white mb-3">Identity Vault Setup</h2>
                <p className="text-slate-500 text-sm max-w-md mx-auto">This local key secures your SSH identities. We never see it.</p>
              </div>
              <div className="max-w-md mx-auto space-y-6 w-full py-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2">Master Password</label>
                  <input
                    type="password"
                    value={masterPassword}
                    onChange={e => setMasterPassword(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-[1.5rem] px-6 py-5 text-white outline-none focus:ring-2 focus:ring-indigo-500 font-mono tracking-[0.4em] shadow-inner text-lg text-center"
                    placeholder="••••••••"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-[1.5rem] px-6 py-5 text-white outline-none focus:ring-2 focus:ring-indigo-500 font-mono tracking-[0.4em] shadow-inner text-lg text-center"
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <div className="mt-auto flex justify-between items-center pt-8 border-t border-slate-800/50">
                <button onClick={() => setCurrentStep('welcome')} className="text-slate-600 hover:text-white font-black text-[11px] uppercase tracking-[0.2em]">Back</button>
                <button
                  disabled={!masterPassword || masterPassword !== confirmPassword || masterPassword.length < 8}
                  onClick={() => setCurrentStep('ai')}
                  className="group flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-12 py-5 rounded-2xl font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 transition-all active:scale-95"
                >
                  Configure AI <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
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
                    className={`relative p-8 rounded-[2.5rem] border flex flex-col items-center gap-5 transition-all duration-300 ${
                      aiConfig.provider === prov.id 
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

              {aiConfig.provider !== AIProvider.NONE && (
                <div className="max-w-2xl mx-auto w-full bg-slate-800/30 p-8 rounded-[2rem] border border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-4 duration-300">
                  {aiConfig.provider !== AIProvider.GEMINI && (
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">API Key</label>
                      <input 
                        type="password" 
                        value={aiConfig.apiKey}
                        onChange={e => setAiConfig({...aiConfig, apiKey: e.target.value})}
                        className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-500"
                        placeholder="sk-..."
                      />
                    </div>
                  )}
                  {aiConfig.provider === AIProvider.OPENAI && (
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Endpoint (Base URL)</label>
                      <input 
                        type="text" 
                        value={aiConfig.baseUrl}
                        onChange={e => setAiConfig({...aiConfig, baseUrl: e.target.value})}
                        className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-500"
                        placeholder="https://api.openai.com/v1"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Model ID</label>
                    <input 
                      type="text" 
                      value={aiConfig.model}
                      onChange={e => setAiConfig({...aiConfig, model: e.target.value})}
                      className="w-full bg-slate-950/50 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder={aiConfig.provider === AIProvider.GEMINI ? "gemini-3-flash-preview" : "gpt-4o"}
                    />
                  </div>
                </div>
              )}

              <div className="mt-auto flex justify-between items-center pt-8 border-t border-slate-800/50">
                <button onClick={() => setCurrentStep('vault')} className="text-slate-600 hover:text-white font-black text-[11px] uppercase tracking-[0.2em]">Back</button>
                <button
                  onClick={() => setCurrentStep('guide')}
                  className="group flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white px-12 py-5 rounded-2xl font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 transition-all active:scale-95"
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
                      className={`w-full p-4 rounded-[1.5rem] border flex items-center gap-4 transition-all duration-300 ${
                        activeGuideTool === toolId ? 'bg-indigo-600/10 border-indigo-500/50 text-indigo-400' : 'bg-slate-800/20 border-slate-800 text-slate-500'
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
              <div className="mt-auto flex justify-between items-center pt-8 border-t border-slate-800/50">
                <button onClick={() => setCurrentStep('ai')} className="text-slate-600 hover:text-white font-black text-[11px] uppercase tracking-[0.2em]">Back</button>
                <button
                  onClick={handleFinish}
                  className="group flex items-center gap-3 bg-emerald-600 hover:bg-emerald-500 text-white px-14 py-5 rounded-2xl font-black uppercase tracking-[0.2em] shadow-2xl shadow-emerald-600/30 transition-all active:scale-95"
                >
                  Enter Command Center <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};