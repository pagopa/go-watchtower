import type { Metadata } from 'next'
import { SystemEventsPage } from './_page-content'

export const metadata: Metadata = {
  title: 'Log Eventi di Sistema',
}

export default function Page() {
  return <SystemEventsPage />
}
