'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import { ReportPageWrapper } from '../_components/report-page-wrapper'

const MttaTrendTab = dynamic(
  () => import('../_components/mtta-trend-tab').then(m => m.MttaTrendTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
)

export function MttaTrendContent() {
  return (
    <ReportPageWrapper
      title="Trend MTTA/MTTR"
      description="Andamento tempi di presa in carico e risoluzione"
    >
      {(products) => <MttaTrendTab products={products} />}
    </ReportPageWrapper>
  )
}
