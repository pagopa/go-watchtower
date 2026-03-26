import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

export const EnvironmentBreakdownChart = dynamic(
  () => import('./environment-breakdown-chart.impl'),
  { ssr: false, loading: () => <Skeleton className="h-80" /> }
)
