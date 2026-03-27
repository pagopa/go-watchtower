import type { Metadata } from 'next'
import { MonthlyKpiContent } from './_page-content'

export const metadata: Metadata = { title: 'Report - KPI Mensili' }

export default function Page() {
  return <MonthlyKpiContent />
}
