import { createFileRoute, Navigate } from '@tanstack/react-router'
import { Login } from '../../components/Login'
import { useApp } from '../contexts/AppContext'

export const Route = createFileRoute('/login')({
  component: LoginComponent,
})

function LoginComponent() {
  const { isSetupComplete, ssoConfig, authMode, handleLogin } = useApp()
  
  // If setup is not complete, redirect to setup
  if (isSetupComplete === false) {
    return <Navigate to="/setup" />
  }
  
  // If setup is still loading, show loading
  if (isSetupComplete === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
        <div className="p-6 rounded-xl" style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-subtle)' }}>
          <div className="w-8 h-8 animate-spin rounded-full border-2 border-t-indigo-500" style={{ borderTopColor: 'var(--color-accent-primary)' }}></div>
          <h2 className="text-xl font-semibold mt-4" style={{ color: 'var(--color-text-primary)' }}>Loading...</h2>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Initializing authentication</p>
        </div>
      </div>
    );
  }
  
  return (
    <Login 
      ssoConfig={ssoConfig}
      authMode={authMode || 'local'}
      onLogin={handleLogin}
    />
  )
}