'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import { ReportPageWrapper } from '../_components/report-page-wrapper'

const OperatorWorkloadTab = dynamic(
  () => import('../_components/operator-workload-tab').then(m => m.OperatorWorkloadTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
)

export function OperatorWorkloadContent() {
  return (
    <ReportPageWrapper
      title="Carico operatori"
      description="Analisi per operatore, suddivise per ambiente"
    >
      {(products) => <OperatorWorkloadTab products={products} />}
    </ReportPageWrapper>
  )
}
