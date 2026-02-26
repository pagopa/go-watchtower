'use client'

import { useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { startOfMonth } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { usePermissions } from '@/hooks/use-permissions'
import { api, type Product, type AnalysisStats } from '@/lib/api-client'
import { TopAlarmsTable, KpiSummaryCards } from './_components/dashboard'

const ByProductEnvironmentChart = dynamic(
  () => import('./_components/dashboard/by-product-environment-chart').then(m => m.ByProductEnvironmentChart),
  { ssr: false, loading: () => <Skeleton className="h-80" /> }
)
const ByOperatorChart = dynamic(
  () => import('./_components/dashboard/by-operator-chart').then(m => m.ByOperatorChart),
  { ssr: false, loading: () => <Skeleton className="h-80" /> }
)
const DailyByEnvironmentChart = dynamic(
  () => import('./_components/dashboard/daily-by-environment-chart').then(m => m.DailyByEnvironmentChart),
  { ssr: false, loading: () => <Skeleton className="h-80" /> }
)
const ByAnalysisTypeChart = dynamic(
  () => import('./_components/dashboard/by-analysis-type-chart').then(m => m.ByAnalysisTypeChart),
  { ssr: false, loading: () => <Skeleton className="h-80" /> }
)
const OnCallTrendChart = dynamic(
  () => import('./_components/dashboard/on-call-trend-chart').then(m => m.OnCallTrendChart),
  { ssr: false, loading: () => <Skeleton className="h-80" /> }
)

const ALL_VALUE = '__all__'

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const { can, isLoading: permissionsLoading } = usePermissions()
  const canReadAnalyses = permissionsLoading || can('ALARM_ANALYSIS', 'read')

  const [selectedProductId, setSelectedProductId] = useState<string>('')
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: new Date(),
  })

  const filters = useMemo(() => {
    const f: Record<string, string> = {}
    if (selectedProductId) f.productId = selectedProductId
    if (dateRange?.from) f.dateFrom = dateRange.from.toISOString()
    if (dateRange?.to) f.dateTo = dateRange.to.toISOString()
    return f
  }, [selectedProductId, dateRange])

  const { data: products } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: api.getProducts,
    enabled: canReadAnalyses,
  })

  const { data: stats, isLoading: statsLoading } = useQuery<AnalysisStats>({
    queryKey: ['analysis-stats', filters],
    queryFn: () => api.getAnalysisStats(filters),
    enabled: canReadAnalyses,
  })

  if (status === 'loading') {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Benvenuto, {session?.user?.name || 'Utente'}
          </p>
        </div>

        {canReadAnalyses && products && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Periodo</Label>
              <DateRangePicker value={dateRange} onChange={setDateRange} />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Prodotto</Label>
              <Select
                value={selectedProductId || ALL_VALUE}
                onValueChange={(val) => setSelectedProductId(val === ALL_VALUE ? '' : val)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>Tutti i prodotti</SelectItem>
                  {products.filter(p => p.isActive).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {canReadAnalyses && (
        <>
          <KpiSummaryCards data={stats?.kpi} isLoading={statsLoading} />

          {statsLoading ? (
            <div className="grid gap-6 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-80" />
              ))}
            </div>
          ) : stats ? (
            <div className="grid gap-6 md:grid-cols-2">
              <ByProductEnvironmentChart data={stats.byProductEnvironment} />
              <ByOperatorChart data={stats.byOperator} />
              <DailyByEnvironmentChart data={stats.dailyByEnvironment} />
              <ByAnalysisTypeChart data={stats.byAnalysisType} />
              <TopAlarmsTable data={stats.topAlarms} />
              <OnCallTrendChart data={stats.onCallTrend} />
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
