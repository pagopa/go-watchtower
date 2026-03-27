import type { Metadata } from 'next'
import { YearlySummaryContent } from './_page-content'

export const metadata: Metadata = { title: 'Report - Riepilogo Annuale' }

export default function Page() {
  return <YearlySummaryContent />
}
