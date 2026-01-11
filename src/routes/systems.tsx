import { createFileRoute } from '@tanstack/react-router'
import { Systems } from '../../components/Systems'

export const Route = createFileRoute('/systems')({
  component: Systems,
})