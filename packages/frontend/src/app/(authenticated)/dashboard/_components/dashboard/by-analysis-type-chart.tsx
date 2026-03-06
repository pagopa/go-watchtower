import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

export const ByAnalysisTypeChart = dynamic(
  () => import('./by-analysis-type-chart.impl'),
  { ssr: false, loading: () => <Skeleton className="h-80" /> }
)
