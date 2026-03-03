import type { Metadata } from 'next'
import { AlarmEventsPageWrapper } from './_page-content'

export const metadata: Metadata = {
  title: 'Allarmi Scattati',
}

export default function AlarmEventsPage() {
  return <AlarmEventsPageWrapper />
}
