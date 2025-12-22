
import React, { useState } from 'react';
import { Shield, Loader2 } from 'lucide-react';

interface LoginProps {
  onLogin: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleSSO = () => {
    setIsRedirecting(true);
    // Simulate OAuth handshake
    setTimeout(() => {
      onLogin();
    }, 1800);
  };

  if (isRedirecting) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-center">
        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-white">Connecting to Fortress IDP...</h2>
        <p className="text-slate-500 mt-2">Authenticating your enterprise session</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center relative overflow-hidden px-4">
      <div className="absolute top-0 left-0 w-full h-full z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-md bg-slate-800/40 backdrop-blur-xl border border-slate-700 p-8 md:p-12 rounded-3xl shadow-2xl">
        <div className="flex justify-center mb-8">
          <div className="p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
            <Shield size={48} className="text-indigo-400" />
          </div>
        </div>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">Fortress Manager</h1>
          <p className="text-slate-400 mt-2">Enterprise-Grade Orchestration</p>
        </div>
        <div className="space-y-4">
          <button onClick={handleSSO} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-3 active:scale-95">
             <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" /> Sign in with Google
          </button>
          <button onClick={handleSSO} className="w-full bg-slate-900 hover:bg-black border border-slate-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-3 active:scale-95">
             <img src="https://www.svgrepo.com/show/355135/github.svg" alt="GitHub" className="w-5 h-5 invert" /> Sign in with GitHub
          </button>
        </div>
        <div className="mt-10 pt-8 border-t border-slate-700/50 text-center">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
            Protected by Fortress Security Protocols
          </p>
        </div>
      </div>
    </div>
  );
};
