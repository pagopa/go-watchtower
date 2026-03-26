import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

export const OperatorBreakdownChart = dynamic(
  () => import('./operator-breakdown-chart.impl'),
  { ssr: false, loading: () => <Skeleton className="h-80" /> }
)
