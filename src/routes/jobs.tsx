import { createFileRoute } from '@tanstack/react-router'
import { Jobs } from '../../components/Jobs'
import { useApp } from '../contexts/AppContext'

export const Route = createFileRoute('/jobs')({
  component: JobsComponent,
})

function JobsComponent() {
  const { aiConfig } = useApp()
  return <Jobs aiConfig={aiConfig} />
}