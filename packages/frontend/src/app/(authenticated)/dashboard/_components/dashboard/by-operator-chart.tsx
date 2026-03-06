import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

export const ByOperatorChart = dynamic(
  () => import('./by-operator-chart.impl'),
  { ssr: false, loading: () => <Skeleton className="h-80" /> }
)
