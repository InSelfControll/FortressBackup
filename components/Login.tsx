import React, { useState, useEffect } from 'react';
import * as API from '../services/api/index.js';
import { Shield, Loader2, Github, Globe, Zap, ShieldCheck, Mail, Lock } from 'lucide-react';
import { SSOConfig, User as UserType } from '../types';

interface LoginProps {
  onLogin: (user: UserType) => void;
  ssoConfig: SSOConfig | null;
  authMode: 'local' | 'sso' | null;
}

export const Login: React.FC<LoginProps> = ({ onLogin, ssoConfig, authMode: propAuthMode }) => {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const processedCode = React.useRef<string | null>(null);

  // Get authMode from props or localStorage
  const [authMode, setAuthMode] = useState<'local' | 'sso' | null>(propAuthMode);
  const checkedAuthMode = React.useRef(false);

  useEffect(() => {
    if (!authMode && !checkedAuthMode.current) {
      checkedAuthMode.current = true;
      const storedMode = localStorage.getItem('fortress_auth_mode') as 'local' | 'sso' | null;
      if (storedMode) setAuthMode(storedMode);
    }
  }, [authMode]);

  // Handle OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code && state === 'github_oauth') {
      // Prevent React Strict Mode from running this twice
      if (processedCode.current === code) return;
      processedCode.current = code;

      // Handle GitHub OAuth callback
      handleGitHubCallback(code);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSSO = () => {
    if (!ssoConfig?.provider) {
      setError('SSO not configured');
      return;
    }

    if (!ssoConfig.clientId) {
      setError('SSO Client ID not configured. Please restart the backend server.');
      console.error('[OAuth] Missing clientId in ssoConfig:', ssoConfig);
      return;
    }

    setIsRedirecting(true);

    if (ssoConfig.provider === 'github') {
      // Redirect to GitHub OAuth
      const clientId = ssoConfig.clientId;
      const redirectUri = encodeURIComponent(window.location.origin + '/');
      const scope = encodeURIComponent('user:email read:user');
      const state = 'github_oauth';

      const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
      console.log('[OAuth] Redirecting to:', authUrl);
      window.location.href = authUrl;
    } else if (ssoConfig.provider === 'google') {
      // Redirect to Google OAuth
      const clientId = ssoConfig.clientId;
      const redirectUri = encodeURIComponent(window.location.origin + '/');
      const scope = encodeURIComponent('email profile');
      const state = 'google_oauth';

      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&state=${state}`;
    } else {
      setError('SSO provider not supported');
      setIsRedirecting(false);
    }
  };

  const handleGitHubCallback = async (code: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Exchange code for user info via backend
      const response = await API.githubAuth(code);
      const result = response.data;

      if (result && result.user) {
        // Token is already set by API.githubAuth
        localStorage.setItem('fortress_user_session', JSON.stringify(result.user));
        onLogin(result.user);
      } else {
        setError(response.error || 'GitHub authentication failed');
      }
    } catch (err) {
      setError('GitHub authentication failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await API.login(email, password);
      const result = response.data;

      if (result && result.user) {
        // Token is already set by API.login
        localStorage.setItem('fortress_user_session', JSON.stringify(result.user));
        onLogin(result.user);
      } else {
        setError(response.error || 'Invalid email or password');
      }
    } catch (err) {
      setError('Login failed. Please check if the server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isRedirecting || isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-center p-6 animate-fade-in">
        <div className="relative mb-12">
          <div className="absolute inset-0 bg-indigo-500/20 blur-[120px] rounded-full animate-pulse"></div>
          <div className="relative bg-slate-900 p-8 rounded-[2.5rem] border border-indigo-500/30 shadow-2xl">
            <Loader2 className="w-16 h-16 text-indigo-500 animate-spin" />
          </div>
        </div>
        <h2 className="text-3xl font-black text-white tracking-tighter mb-3">
          {isRedirecting ? 'Redirecting to Provider...' : 'Authenticating...'}
        </h2>
        <p className="text-slate-500 font-bold uppercase tracking-[0.4em] text-[10px] animate-pulse">
          {isRedirecting ? 'Opening OAuth flow' : 'Validating credentials'}
        </p>
      </div>
    );
  }

  const providerName = ssoConfig?.provider === 'google' ? 'Google' : ssoConfig?.provider === 'github' ? 'GitHub' : 'Enterprise SSO';

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center relative overflow-hidden px-4 font-sans selection:bg-indigo-500/30">
      <div className="absolute top-0 left-0 w-full h-full z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[80%] h-[80%] bg-indigo-600/10 rounded-full blur-[160px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[80%] h-[80%] bg-blue-600/10 rounded-full blur-[160px]" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-widest mb-6 shadow-sm">
            <Zap size={14} className="fill-current" /> Secure Access
          </div>
          <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-indigo-600/40 border-4 border-slate-900">
            <ShieldCheck size={48} className="text-white" />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tighter mb-2">Fortress Vault</h1>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-widest">
            Enterprise Command Portal
          </p>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-3xl border border-slate-800/80 p-10 rounded-[3rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] space-y-4">

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-rose-400 text-sm text-center mb-4">
              {error}
            </div>
          )}

          {/* SSO Only Mode */}
          {authMode === 'sso' && ssoConfig?.provider && (
            <>
              <button
                onClick={handleSSO}
                className={`w-full flex items-center justify-center gap-4 py-4 px-6 rounded-2xl font-bold transition-all active:scale-[0.98] shadow-lg ${ssoConfig?.provider === 'google' ? 'bg-white text-slate-900 hover:bg-slate-100' : 'bg-slate-800 text-white hover:bg-slate-700'
                  }`}
              >
                {ssoConfig?.provider === 'google' && <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />}
                {ssoConfig?.provider === 'github' && <Github size={20} />}
                {ssoConfig?.provider === 'oidc' && <Globe size={20} className="text-indigo-400" />}
                Continue with {providerName}
              </button>
              <p className="text-center text-slate-600 text-xs mt-4">
                Your organization uses {providerName} for authentication
              </p>
            </>
          )}

          {/* Local Auth Mode */}
          {authMode === 'local' && (
            <form onSubmit={handleLocalLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Email Address</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@company.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-12 pr-4 py-4 text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">Password</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-12 pr-4 py-4 text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl font-bold transition-all active:scale-[0.98] shadow-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <ShieldCheck size={20} />
                )}
                {isLoading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>
          )}

          {/* Fallback if no auth mode set */}
          {!authMode && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-4" />
              <p className="text-slate-500 text-sm">Loading authentication...</p>
            </div>
          )}
        </div>

        <p className="text-center text-slate-700 text-[10px] font-bold uppercase tracking-widest mt-8">
          Fortress Backup Manager • Enterprise Security
        </p>
      </div>
    </div>
  );
};
