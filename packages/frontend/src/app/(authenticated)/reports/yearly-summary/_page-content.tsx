'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import { ReportPageWrapper } from '../_components/report-page-wrapper'

const YearlySummaryTab = dynamic(
  () => import('../_components/yearly-summary-tab').then(m => m.YearlySummaryTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
)

export function YearlySummaryContent() {
  return (
    <ReportPageWrapper
      title="Riepilogo Annuale"
      description="Metriche mensili produzione e totali"
    >
      {(products) => <YearlySummaryTab products={products} />}
    </ReportPageWrapper>
  )
}
