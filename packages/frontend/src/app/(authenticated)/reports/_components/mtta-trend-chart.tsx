import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

export const MttaTrendChart = dynamic(
  () => import('./mtta-trend-chart.impl'),
  { ssr: false, loading: () => <Skeleton className="h-80" /> }
)
