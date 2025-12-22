
import React, { useState } from 'react';
import { 
  Shield, Key, Server, Check, ArrowRight, Github, 
  ShieldCheck, Lock, Terminal, Info, Zap, Database, ExternalLink,
  ChevronRight, Circle, CheckCircle2, Layout, Boxes, Cpu, Plus
} from 'lucide-react';

interface SetupProps {
  onComplete: (masterPassword?: string) => void;
}

type SetupStep = 'welcome' | 'auth' | 'vault' | 'guide';

export const Setup: React.FC<SetupProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState<SetupStep>('welcome');
  const [ssoProvider, setSsoProvider] = useState<'google' | 'github' | 'oidc' | null>(null);
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>(['borg']);
  const [activeGuideTool, setActiveGuideTool] = useState<string>('borg');

  const steps = [
    { id: 'welcome', label: 'Welcome', icon: Layout },
    { id: 'auth', label: 'Identity', icon: Shield },
    { id: 'vault', label: 'Vault', icon: Lock },
    { id: 'guide', label: 'Infrastructure', icon: Terminal },
  ];

  const toggleTool = (tool: string) => {
    setSelectedTools(prev => 
      prev.includes(tool) ? prev.filter(t => t !== tool) : [...prev, tool]
    );
    setActiveGuideTool(tool);
  };

  const handleFinish = () => {
    onComplete(masterPassword);
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
      {/* Background Orbs */}
      <div className="absolute top-0 left-0 w-full h-full z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-indigo-600/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] bg-blue-600/10 rounded-full blur-[140px]" />
      </div>

      <div className="relative z-10 w-full max-w-5xl flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-widest mb-2 shadow-sm">
            <Zap size={14} className="fill-current" /> System Initialization Sequence
          </div>
          <h1 className="text-5xl font-black text-white tracking-tighter leading-tight">Welcome to Fortress</h1>
          <p className="text-slate-400 max-w-lg mx-auto text-lg leading-relaxed">
            Your journey to a secure, enterprise-grade backup infrastructure begins here. Let's configure your environment.
          </p>
        </div>

        <div className="flex items-center justify-center gap-6 px-4 py-6 bg-slate-900/30 backdrop-blur-md rounded-[2rem] border border-slate-800/50 w-fit mx-auto shadow-2xl">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isPast = getStepIndex(currentStep) > idx;

            return (
              <React.Fragment key={step.id}>
                <div 
                  className="flex flex-col items-center gap-3 transition-all duration-300" 
                  title={step.label}
                >
                  <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center transition-all duration-500 relative group ${
                    isActive ? 'bg-indigo-600 border-indigo-400 text-white scale-110 shadow-[0_0_30px_rgba(79,70,229,0.4)]' : 
                    isPast ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 
                    'bg-slate-800/50 border-slate-700/50 text-slate-500'
                  }`}>
                    {isPast ? <CheckCircle2 size={28} /> : <Icon size={28} />}
                    {isActive && (
                      <div className="absolute -bottom-1 w-1 h-1 bg-white rounded-full animate-ping" />
                    )}
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${isActive ? 'text-indigo-400' : 'text-slate-600'}`}>
                    {step.label}
                  </span>
                </div>
                {idx < steps.length - 1 && (
                  <div className={`h-[2px] w-20 transition-all duration-700 ${isPast ? 'bg-emerald-500/30' : 'bg-slate-800/50'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div className="bg-slate-900/60 backdrop-blur-2xl border border-slate-800/80 rounded-[3rem] p-10 md:p-14 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] relative overflow-hidden min-h-[500px] flex flex-col transition-all duration-500">
          
          {currentStep === 'welcome' && (
            <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500 flex-1 flex flex-col">
              <div className="text-center space-y-3">
                <div className="w-20 h-20 bg-indigo-600/20 rounded-[2rem] flex items-center justify-center mx-auto border border-indigo-500/20 mb-4 shadow-inner">
                  <Boxes size={40} className="text-indigo-400" />
                </div>
                <h2 className="text-3xl font-black text-white">Select Your Arsenal</h2>
                <p className="text-slate-500 text-sm max-w-md mx-auto font-medium">Which backup technologies will you be integrating? This helps us tailor your onboarding guide.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto w-full">
                {['borg', 'restic', 'rsync'].map((tool) => (
                  <button
                    key={tool}
                    onClick={() => toggleTool(tool)}
                    className={`group relative p-8 rounded-[2rem] border transition-all duration-300 text-left overflow-hidden ${
                      selectedTools.includes(tool) 
                        ? 'bg-indigo-600/10 border-indigo-500/50 shadow-xl' 
                        : 'bg-slate-800/30 border-slate-700/50 hover:border-slate-600'
                    }`}
                  >
                    <div className="relative z-10">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-colors ${selectedTools.includes(tool) ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                        <Database size={24} />
                      </div>
                      <h4 className="text-lg font-black text-white capitalize mb-2">{tool}</h4>
                      <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-tight">{guides[tool].desc}</p>
                    </div>
                    {selectedTools.includes(tool) && (
                      <div className="absolute top-6 right-6 text-indigo-400">
                        <CheckCircle2 size={24} />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <div className="mt-auto flex justify-center pt-8">
                <button
                  disabled={selectedTools.length === 0}
                  onClick={() => setCurrentStep('auth')}
                  className="group flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-12 py-5 rounded-2xl font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 transition-all active:scale-95"
                >
                  Configure Identity <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {currentStep === 'auth' && (
            <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500 flex-1 flex flex-col">
              <div className="text-center">
                <h2 className="text-3xl font-black text-white mb-3">Enterprise Identity Control</h2>
                <p className="text-slate-500 text-sm max-w-md mx-auto">Link your organization's identity provider to enable seamless, secure access.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto w-full">
                {[
                  { id: 'google', label: 'Google Workspace', icon: 'https://www.svgrepo.com/show/475656/google-color.svg' },
                  { id: 'github', label: 'GitHub Enterprise', icon: 'https://www.svgrepo.com/show/355135/github.svg' },
                  { id: 'oidc', label: 'Custom OIDC', icon: null }
                ].map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => setSsoProvider(provider.id as any)}
                    className={`relative p-8 rounded-[2.5rem] border flex flex-col items-center gap-5 transition-all duration-300 ${
                      ssoProvider === provider.id 
                        ? 'bg-indigo-600/10 border-indigo-500 ring-4 ring-indigo-500/10 shadow-2xl' 
                        : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="w-16 h-16 rounded-2xl bg-slate-900/80 flex items-center justify-center p-3 border border-slate-700/50 shadow-inner">
                      {provider.icon ? (
                        <img src={provider.icon} className={`w-full h-full ${provider.id === 'github' ? 'invert opacity-80' : ''}`} alt={provider.label} />
                      ) : (
                        <Cpu className="text-indigo-400" size={32} />
                      )}
                    </div>
                    <span className="text-sm font-black uppercase tracking-widest text-slate-300">{provider.label}</span>
                    {ssoProvider === provider.id && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-indigo-500 text-white rounded-full text-[9px] font-black uppercase tracking-[0.2em] shadow-lg">Primary Provider</div>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-auto flex justify-between items-center pt-8 border-t border-slate-800/50">
                <button onClick={() => setCurrentStep('welcome')} className="text-slate-600 hover:text-white font-black text-[11px] uppercase tracking-[0.2em] transition-colors px-4 py-2">Previous Step</button>
                <button
                  disabled={!ssoProvider}
                  onClick={() => setCurrentStep('vault')}
                  className="group flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-12 py-5 rounded-2xl font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 transition-all active:scale-95"
                >
                  Configure Vault <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {currentStep === 'vault' && (
            <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500 flex-1 flex flex-col">
              <div className="text-center">
                <h2 className="text-3xl font-black text-white mb-3">Initialize Zero-Trust Vault</h2>
                <p className="text-slate-500 text-sm max-w-md mx-auto">This password encrypts your local keys. It is never transmitted beyond this browser.</p>
              </div>
              <div className="max-w-md mx-auto space-y-6 w-full py-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2">Secure Master Password</label>
                  <div className="relative group">
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-400 transition-colors" size={20} />
                    <input
                      type="password"
                      value={masterPassword}
                      onChange={e => setMasterPassword(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-[1.5rem] pl-14 pr-6 py-5 text-white outline-none focus:ring-2 focus:ring-indigo-500 font-mono tracking-[0.4em] shadow-inner text-lg"
                      placeholder="••••••••••••"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2">Confirm Entropic Key</label>
                  <div className="relative group">
                    <ShieldCheck className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-400 transition-colors" size={20} />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-[1.5rem] pl-14 pr-6 py-5 text-white outline-none focus:ring-2 focus:ring-indigo-500 font-mono tracking-[0.4em] shadow-inner text-lg"
                      placeholder="••••••••••••"
                    />
                  </div>
                </div>
                
                <div className="p-6 bg-indigo-500/5 border border-indigo-500/10 rounded-3xl flex gap-5 items-start">
                  <div className="p-3 bg-indigo-600/10 rounded-2xl border border-indigo-500/20 text-indigo-400">
                    <ShieldCheck size={24} />
                  </div>
                  <div>
                    <h5 className="text-[11px] font-black text-indigo-300 uppercase tracking-widest mb-1">Cryptographic Integrity</h5>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-semibold uppercase tracking-tight">Your password generates a 256-bit AES-GCM key via PBKDF2 (100k iterations). We provide zero-knowledge protection.</p>
                  </div>
                </div>
              </div>
              <div className="mt-auto flex justify-between items-center pt-8 border-t border-slate-800/50">
                <button onClick={() => setCurrentStep('auth')} className="text-slate-600 hover:text-white font-black text-[11px] uppercase tracking-[0.2em] transition-colors px-4 py-2">Back</button>
                <button
                  disabled={!masterPassword || masterPassword !== confirmPassword || masterPassword.length < 8}
                  onClick={() => setCurrentStep('guide')}
                  className="group flex items-center gap-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-12 py-5 rounded-2xl font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/30 transition-all active:scale-95"
                >
                  Finalize Setup <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {currentStep === 'guide' && (
            <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500 flex-1 flex flex-col">
              <div className="text-center">
                <h2 className="text-3xl font-black text-white mb-3">Infrastructure Preparation</h2>
                <p className="text-slate-500 text-sm max-w-md mx-auto">Follow these steps to prepare your selected environments for Fortress management.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 flex-1">
                <div className="md:col-span-4 space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Available Guides</label>
                  {selectedTools.map(toolId => (
                    <button
                      key={toolId}
                      onClick={() => setActiveGuideTool(toolId)}
                      className={`w-full p-5 rounded-[1.5rem] border flex items-center gap-4 transition-all duration-300 ${
                        activeGuideTool === toolId 
                          ? 'bg-indigo-600/10 border-indigo-500/50 text-indigo-400 shadow-lg' 
                          : 'bg-slate-800/20 border-slate-800 text-slate-500 hover:border-slate-700'
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${activeGuideTool === toolId ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-600'}`}>
                        <Database size={18} />
                      </div>
                      <span className="text-[12px] font-black uppercase tracking-widest">{toolId}</span>
                      <ChevronRight size={16} className={`ml-auto transition-transform ${activeGuideTool === toolId ? 'translate-x-1' : ''}`} />
                    </button>
                  ))}
                  {Object.keys(guides).filter(t => !selectedTools.includes(t)).length > 0 && (
                    <div className="pt-4 mt-4 border-t border-slate-800/50">
                      <label className="text-[9px] font-black text-slate-700 uppercase tracking-widest ml-1 mb-2 block">Other Options</label>
                      {Object.keys(guides).filter(t => !selectedTools.includes(t)).map(toolId => (
                        <button
                          key={toolId}
                          onClick={() => { toggleTool(toolId); setActiveGuideTool(toolId); }}
                          className="w-full p-4 rounded-xl border border-transparent text-slate-600 hover:text-slate-400 transition-colors flex items-center gap-3"
                        >
                          <Plus size={14} />
                          <span className="text-[10px] font-black uppercase tracking-widest">Enable {toolId}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="md:col-span-8 bg-slate-950/40 border border-slate-800/80 rounded-[2.5rem] p-10 relative overflow-hidden group shadow-inner">
                  <div className="absolute top-0 right-0 p-8 opacity-[0.03] rotate-12 pointer-events-none">
                    <Terminal size={240} />
                  </div>
                  <div className="relative z-10 space-y-8">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-2xl font-black text-white flex items-center gap-3">
                          {guides[activeGuideTool].title}
                        </h3>
                        <p className="text-sm text-slate-500 mt-2 font-medium">
                          {guides[activeGuideTool].desc}
                        </p>
                      </div>
                      <a href={`https://docs.fortress.io/tools/${activeGuideTool}`} target="_blank" className="p-3 bg-slate-800/50 rounded-xl hover:bg-slate-700 transition-colors text-slate-400 hover:text-indigo-400">
                        <ExternalLink size={20} />
                      </a>
                    </div>
                    
                    <div className="space-y-4">
                      {guides[activeGuideTool].steps.map((step: string, i: number) => (
                        <div key={i} className="flex gap-6 items-start group/step">
                          <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-[12px] font-black text-indigo-400 flex-shrink-0 mt-0.5 group-hover/step:border-indigo-500/50 transition-colors">
                            {i + 1}
                          </div>
                          <p className="text-[13px] text-slate-300 leading-relaxed font-medium py-1">
                            {step.split('`').map((part, index) => (
                              index % 2 === 1 
                                ? <code key={index} className="px-2 py-1 bg-black/50 rounded-lg border border-slate-800 text-indigo-400 font-mono text-[11px] mx-1">{part}</code> 
                                : part
                            ))}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="pt-6 border-t border-slate-800/50">
                       <p className="text-[10px] text-slate-600 uppercase font-black tracking-widest flex items-center gap-2">
                         <Info size={14} /> After following these steps, navigate to the <span className="text-indigo-500/70">Systems</span> tab to add your host.
                       </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-auto flex justify-between items-center pt-8 border-t border-slate-800/50">
                <button onClick={() => setCurrentStep('vault')} className="text-slate-600 hover:text-white font-black text-[11px] uppercase tracking-[0.2em] transition-colors px-4 py-2">Adjust Vault</button>
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
        
        <div className="text-center">
           <p className="text-[9px] text-slate-700 uppercase font-black tracking-[0.6em] animate-pulse">Initializing Fortress Core Engine v2.5.0-PRIME</p>
        </div>
      </div>
    </div>
  );
};
