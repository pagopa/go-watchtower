import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

export const DailyByEnvironmentChart = dynamic(
  () => import('./daily-by-environment-chart.impl'),
  { ssr: false, loading: () => <Skeleton className="h-80" /> }
)
