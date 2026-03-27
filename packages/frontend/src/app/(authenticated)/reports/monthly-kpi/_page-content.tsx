'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import { ReportPageWrapper } from '../_components/report-page-wrapper'

const MonthlyKpiTab = dynamic(
  () => import('../_components/monthly-kpi-tab').then(m => m.MonthlyKpiTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
)

export function MonthlyKpiContent() {
  return (
    <ReportPageWrapper
      title="KPI Mensili"
      description="Conteggi giornalieri per ambiente e mese"
    >
      {(products) => <MonthlyKpiTab products={products} />}
    </ReportPageWrapper>
  )
}
