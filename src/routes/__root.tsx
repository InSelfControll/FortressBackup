import { createRootRoute, Outlet, Navigate, useLocation } from '@tanstack/react-router'
import { AppProvider, useApp } from '../contexts/AppContext'
import { Toaster } from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import { Sidebar } from '../../components/layout/Sidebar'
import { Header } from '../../components/layout/Header'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/setup', '/landing']

function AppContent() {
  const { isSetupComplete, currentUser } = useApp()
  const location = useLocation()

  const isPublicRoute = PUBLIC_ROUTES.includes(location.pathname)

  // Loading state
  if (isSetupComplete === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6">
        <Loader2 className="animate-spin text-indigo-500" size={48} />
        <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Initializing Database...</p>
      </div>
    )
  }

  // Setup flow - redirect to setup when not complete
  if (isSetupComplete === false && !isPublicRoute) {
    return <Navigate to="/setup" />
  }

  // Public routes - always render the Outlet (login page, setup page, landing page)
  // But redirect away from setup/login when appropriate
  if (isPublicRoute) {
    // If setup is complete and user is on /setup, redirect to login
    if (isSetupComplete === true && location.pathname === '/setup') {
      return <Navigate to="/login" />
    }
    // If user is logged in and trying to access login page, redirect to dashboard
    if (currentUser && location.pathname === '/login') {
      return <Navigate to="/dashboard" />
    }
    return (
      <>
        <Outlet />
        <Toaster position="bottom-right" />
      </>
    )
  }

  // If setup is complete and no user, redirect to login
  if (isSetupComplete === true && !currentUser) {
    return <Navigate to="/login" />
  }

  // Main app layout - show dashboard layout when authenticated
  if (isSetupComplete === true && currentUser) {
    return (
      <div className="flex min-h-screen" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 overflow-auto p-6" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
            <div className="max-w-7xl mx-auto">
              <Outlet />
            </div>
          </div>
        </main>
        <Toaster position="bottom-right" />
      </div>
    )
  }

  // Fallback
  return <Outlet />
}
