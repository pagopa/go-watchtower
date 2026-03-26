import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

export const OccurrenceTrendChart = dynamic(
  () => import('./occurrence-trend-chart.impl'),
  { ssr: false, loading: () => <Skeleton className="h-80" /> }
)
