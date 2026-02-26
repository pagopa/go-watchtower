import type { Metadata } from 'next'
import { ReportsPageContent } from './_page-content'

export const metadata: Metadata = {
  title: 'Report',
}

export default function Page() {
  return <ReportsPageContent />
}
