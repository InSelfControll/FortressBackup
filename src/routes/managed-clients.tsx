import { createFileRoute, Navigate } from '@tanstack/react-router'
import { ManagedClients } from '../../components/ManagedClients'
import { useApp } from '../contexts/AppContext'

export const Route = createFileRoute('/managed-clients')({
  component: ManagedClientsRoute,
})

function ManagedClientsRoute() {
  const { currentUser } = useApp()
  if (currentUser?.role !== 'admin') return <Navigate to="/dashboard" />
  return <ManagedClients />
}
