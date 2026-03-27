'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import { ReportPageWrapper } from '../_components/report-page-wrapper'

const AlarmRankingTab = dynamic(
  () => import('../_components/alarm-ranking-tab').then(m => m.AlarmRankingTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
)

export function AlarmRankingContent() {
  return (
    <ReportPageWrapper
      title="Classifica allarmi"
      description="Allarmi ordinati per frequenza e occorrenze"
    >
      {(products) => <AlarmRankingTab products={products} />}
    </ReportPageWrapper>
  )
}
