import { createFileRoute, redirect } from '@tanstack/react-router'
import { Setup } from '../../components/Setup'
import { useApp } from '../contexts/AppContext'

export const Route = createFileRoute('/setup')({
  component: SetupComponent,
})

function SetupComponent() {
  const { completeSetup } = useApp()
  
  return <Setup onComplete={completeSetup} />
}