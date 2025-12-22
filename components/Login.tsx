
import React, { useState } from 'react';
import { Shield, Loader2, Github, Globe, Zap, ShieldCheck } from 'lucide-react';
import { SSOConfig } from '../types';

interface LoginProps {
  onLogin: () => void;
  ssoConfig: SSOConfig | null;
}

export const Login: React.FC<LoginProps> = ({ onLogin, ssoConfig }) => {
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleSSO = () => {
    setIsRedirecting(true);
    // Real-world: window.location.href = ssoConfig.authorizeUrl...
    setTimeout(() => {
      onLogin();
    }, 2000);
  };

  if (isRedirecting) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-center p-6 animate-fade-in">
        <div className="relative mb-12">
          <div className="absolute inset-0 bg-indigo-500/20 blur-[120px] rounded-full animate-pulse"></div>
          <div className="relative bg-slate-900 p-8 rounded-[2.5rem] border border-indigo-500/30 shadow-2xl">
            <Loader2 className="w-16 h-16 text-indigo-500 animate-spin" />
          </div>
        </div>
        <h2 className="text-3xl font-black text-white tracking-tighter mb-3">Authenticating Identity...</h2>
        <p className="text-slate-500 font-bold uppercase tracking-[0.4em] text-[10px] animate-pulse">
          Exchanging OIDC Tokens securely
        </p>
      </div>
    );
  }

  const providerName = ssoConfig?.provider === 'google' ? 'Google' : ssoConfig?.provider === 'github' ? 'GitHub' : 'Enterprise SAML';

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center relative overflow-hidden px-4 font-sans selection:bg-indigo-500/30">
      <div className="absolute top-0 left-0 w-full h-full z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[80%] h-[80%] bg-indigo-600/10 rounded-full blur-[160px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[80%] h-[80%] bg-blue-600/10 rounded-full blur-[160px]" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-widest mb-6 shadow-sm">
            <Zap size={14} className="fill-current" /> SSO Protected Domain
          </div>
          <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-indigo-600/40 border-4 border-slate-900">
            <ShieldCheck size={48} className="text-white" />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tighter mb-2">Fortress Vault</h1>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-widest">Enterprise Command Portal</p>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-3xl border border-slate-800/80 p-10 rounded-[3rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] space-y-4">
          <button 
            onClick={handleSSO}
            className={`w-full flex items-center justify-center gap-4 py-4 px-6 rounded-2xl font-bold transition-all active:scale-[0.98] shadow-lg ${
                ssoConfig?.provider === 'google' ? 'bg-white text-slate-900 hover:bg-slate-100' : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
          >
            {ssoConfig?.provider === 'google' && <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />}
            {ssoConfig?.provider === 'github' && <Github size={20} />}
            {ssoConfig?.provider === 'oidc' && <Globe size={20} />}
            <span className="text-sm">Sign in with {providerName}</span>
          </button>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800"></div>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest">
              <span className="bg-[#0f172a] px-4 text-slate-600 tracking-widest">OIDC v2.0 Protocol</span>
            </div>
          </div>

          <p className="text-[10px] text-slate-500 text-center leading-relaxed">
            Infrastructure access is locked to the <strong>{ssoConfig?.clientId?.substring(0, 10)}...</strong> tenant. 
            Contact systems administrator for unauthorized access resolution.
          </p>
        </div>

        <p className="mt-10 text-center text-slate-600 text-[10px] font-black uppercase tracking-[0.3em]">
          Protected by Fortress Security Protocols
        </p>
      </div>
    </div>
  );
};
