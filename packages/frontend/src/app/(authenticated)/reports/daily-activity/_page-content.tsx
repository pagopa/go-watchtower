'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import { ReportPageWrapper } from '../_components/report-page-wrapper'

const DailyActivityTab = dynamic(
  () => import('../_components/daily-activity-tab').then(m => m.DailyActivityTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
)

export function DailyActivityContent() {
  return (
    <ReportPageWrapper
      title="Timesheet"
      description="Attività giornaliera degli operatori per mese e prodotto"
    >
      {(products) => <DailyActivityTab products={products} />}
    </ReportPageWrapper>
  )
}
