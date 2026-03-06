import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

export const ByProductEnvironmentChart = dynamic(
  () => import('./by-product-environment-chart.impl'),
  { ssr: false, loading: () => <Skeleton className="h-80" /> }
)
