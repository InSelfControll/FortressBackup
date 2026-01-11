import React, { useState, useEffect } from 'react';
import * as API from '../client/api/index.js';
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

  const [authMode, setAuthMode] = useState<'local' | 'sso' | null>(propAuthMode);
  const checkedAuthMode = React.useRef(false);



  useEffect(() => {
    if (!authMode && !checkedAuthMode.current) {
      checkedAuthMode.current = true;
      const storedMode = localStorage.getItem('fortress_auth_mode') as 'local' | 'sso' | null;
      if (storedMode) setAuthMode(storedMode);
      // If no stored mode, default to local
      if (!storedMode) setAuthMode('local');
    }
  }, [authMode]);

  // Sync with prop changes
  useEffect(() => {
    if (propAuthMode && propAuthMode !== authMode) {
      setAuthMode(propAuthMode);
    }
  }, [propAuthMode]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code && state === 'github_oauth') {
      if (processedCode.current === code) return;
      processedCode.current = code;
      handleGitHubCallback(code);
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
      setError('SSO Client ID not configured.');
      return;
    }
    setIsRedirecting(true);

    if (ssoConfig.provider === 'github') {
      const clientId = ssoConfig.clientId;
      const redirectUri = encodeURIComponent(window.location.origin + '/login');
      const scope = encodeURIComponent('user:email read:user');
      const state = 'github_oauth';
      window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
    } else if (ssoConfig.provider === 'google') {
      const clientId = ssoConfig.clientId;
      const redirectUri = encodeURIComponent(window.location.origin + '/login');
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
      const response = await API.githubAuth(code);
      const result = response.data;
      if (result && result.user) {
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
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
        <div className="p-6 rounded-xl mb-6" style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)' }}>
          <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--color-accent-primary)' }} />
        </div>
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
          {isRedirecting ? 'Redirecting...' : 'Authenticating...'}
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {isRedirecting ? 'Opening OAuth provider' : 'Validating credentials'}
        </p>
      </div>
    );
  }

  const providerName = ssoConfig?.provider === 'google' ? 'Google' : ssoConfig?.provider === 'github' ? 'GitHub' : 'Enterprise SSO';

  // Determine if SSO is properly configured (has both provider AND clientId)
  const isSsoConfigured = Boolean(ssoConfig?.provider && ssoConfig?.clientId);

  // Debug log to help diagnose login issues
  console.log('[Login] Render state:', { authMode, ssoConfig, isSsoConfigured, providerName });

  // Show loading state when authMode is null
  if (!authMode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
        <div className="p-6 rounded-xl" style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)' }}>
          <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--color-accent-primary)' }} />
          <h2 className="text-xl font-semibold mt-4" style={{ color: 'var(--color-text-primary)' }}>Loading...</h2>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Setting up authentication</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'var(--color-accent-primary)' }}>
            <ShieldCheck size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>Fortress Backup</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Sign in to your account</p>
        </div>

        {/* Login Card */}
        <div className="p-6 rounded-xl" style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)' }}>
          {error && (
            <div className="p-3 rounded-lg mb-4 text-sm" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'var(--color-error)' }}>
              {error}
            </div>
          )}

          {/* SSO Mode - properly configured */}
          {authMode === 'sso' && isSsoConfigured && (
            <>
              <button
                onClick={handleSSO}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg font-medium transition-colors"
                style={{
                  backgroundColor: ssoConfig?.provider === 'google' ? '#fff' : 'var(--color-bg-tertiary)',
                  color: ssoConfig?.provider === 'google' ? '#1f2937' : 'var(--color-text-primary)',
                  border: `1px solid ${ssoConfig?.provider === 'google' ? '#d1d5db' : 'var(--color-border-default)'}`
                }}
              >
                {ssoConfig?.provider === 'google' && <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />}
                {ssoConfig?.provider === 'github' && <Github size={18} />}
                {ssoConfig?.provider === 'oidc' && <Globe size={18} />}
                Continue with {providerName}
              </button>
              <p className="text-center text-xs mt-4" style={{ color: 'var(--color-text-muted)' }}>
                Your organization uses {providerName} for authentication
              </p>
            </>
          )}

          {/* SSO Mode but SSO not properly configured - show error and fallback */}
          {authMode === 'sso' && !isSsoConfigured && (
            <>
              <div className="p-3 rounded-lg mb-4 text-sm" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', color: 'var(--color-warning, #f59e0b)' }}>
                SSO is enabled but not properly configured. Please contact your administrator or use local authentication.
              </div>
              <button
                onClick={() => {
                  setAuthMode('local');
                  localStorage.setItem('fortress_auth_mode', 'local');
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium transition-colors"
                style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)' }}
              >
                <Mail size={18} />
                Use Local Authentication
              </button>
            </>
          )}

          {/* Local Auth */}
          {authMode === 'local' && (
            <form onSubmit={handleLocalLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@company.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm outline-none focus:ring-2"
                    style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm outline-none focus:ring-2"
                    style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-accent-primary)', color: '#fff' }}
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                {isLoading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}

          {/* Loading */}
          {!authMode && (
            <div className="text-center py-6">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" style={{ color: 'var(--color-accent-primary)' }} />
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--color-text-muted)' }}>
          Fortress Backup Manager
        </p>
      </div>
    </div>
  );
};
