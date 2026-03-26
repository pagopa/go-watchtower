import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

export const MttaMttrTrendChart = dynamic(
  () => import('./mtta-mttr-trend-chart.impl'),
  { ssr: false, loading: () => <Skeleton className="h-80" /> }
)
