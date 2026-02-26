import type { Metadata } from 'next'
import { AnalysesPageWrapper } from './_page-content'

export const metadata: Metadata = {
  title: 'Analisi Allarmi',
}

export default function Page() {
  return <AnalysesPageWrapper />
}
