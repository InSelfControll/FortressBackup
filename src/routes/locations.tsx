import { createFileRoute } from '@tanstack/react-router'
import { Locations } from '../../components/Locations'

export const Route = createFileRoute('/locations')({
  component: Locations,
})