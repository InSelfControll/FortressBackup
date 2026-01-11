import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    // Check the backend status to determine where to redirect
    try {
      const response = await fetch('/api/status')
      if (response.ok) {
        const status = await response.json()
        if (status.setupComplete) {
          // Setup is complete - redirect to dashboard (login check happens in __root)
          throw redirect({ to: '/dashboard' })
        }
      }
    } catch (e) {
      // If fetch fails or redirect was thrown, let it propagate
      if (e instanceof Response || (e as any)?.redirect) throw e
    }
    // Default: redirect to setup if we couldn't determine status
    throw redirect({ to: '/setup' })
  },
  component: () => null, // This route only redirects
})