import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

export const OnCallTrendChart = dynamic(
  () => import('./on-call-trend-chart.impl'),
  { ssr: false, loading: () => <Skeleton className="h-80" /> }
)
