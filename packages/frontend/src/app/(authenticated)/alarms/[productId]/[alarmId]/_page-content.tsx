'use client'

import { useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { startOfMonth, subMonths } from '@go-watchtower/shared'
import type { DateRange } from 'react-day-picker'
import {
  FileBarChart, Hash, Clock, EyeOff, ArrowLeft,
  BookOpen, ExternalLink,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { api, type AlarmDetailData } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { OccurrenceTrendChart } from './_components/occurrence-trend-chart'
import { EnvironmentBreakdownChart } from './_components/environment-breakdown-chart'
import { OperatorBreakdownChart } from './_components/operator-breakdown-chart'
import { RecentAnalysesTable } from './_components/recent-analyses-table'
import { AlarmAssociations } from './_components/alarm-associations'

// ── KPI Cards ────────────────────────────────────────────────────────────────

function formatDuration(ms: number | null): string {
  if (ms == null) return '—'
  const totalMinutes = Math.round(ms / 60_000)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return remHours > 0 ? `${days}g ${remHours}h` : `${days}g`
}

function KpiCard({
  title,
  value,
  icon: Icon,
}: {
  title: string
  value: string | number
  icon: React.ElementType
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div className="rounded-full bg-muted p-3">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function KpiSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
              </div>
              <Skeleton className="h-11 w-11 rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function AlarmDetailPageContent() {
  const params = useParams<{ productId: string; alarmId: string }>()
  const { productId, alarmId } = params

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(subMonths(new Date(), 3)),
    to: new Date(),
  })

  const filters = useMemo(() => {
    const f: Record<string, string> = {}
    if (dateRange?.from) f.dateFrom = dateRange.from.toISOString()
    if (dateRange?.to) f.dateTo = dateRange.to.toISOString()
    return f
  }, [dateRange])

  const { data, isLoading } = useQuery<AlarmDetailData>({
    queryKey: qk.alarms.detail(productId, alarmId, filters),
    queryFn: () => api.getAlarmDetail(productId, alarmId, filters),
    enabled: !!productId && !!alarmId,
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link href={`/products/${productId}`} className="hover:text-foreground transition-colors">
              {data?.alarm.productName || 'Prodotto'}
            </Link>
            <span>/</span>
            <span>Allarmi</span>
            <span>/</span>
            <span className="text-foreground font-medium">{data?.alarm.name || '...'}</span>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="h-8 w-8">
              <Link href={`/products/${productId}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">{data?.alarm.name || <Skeleton className="h-8 w-48 inline-block" />}</h1>
          </div>

          {data?.alarm.description && (
            <p className="text-muted-foreground text-sm ml-11">{data.alarm.description}</p>
          )}

          {/* Runbook link */}
          {data?.alarm.runbook && (
            <div className="flex items-center gap-2 ml-11 mt-1">
              <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
              <a
                href={data.alarm.runbook.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
              >
                {data.alarm.runbook.name}
                <ExternalLink className="h-3 w-3" />
              </a>
              <Badge variant="outline" className="text-xs">
                {data.alarm.runbook.status}
              </Badge>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Periodo</Label>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <KpiSkeleton />
      ) : data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Analisi Totali" value={data.kpi.totalAnalyses} icon={FileBarChart} />
          <KpiCard title="Occorrenze Totali" value={data.kpi.totalOccurrences} icon={Hash} />
          <KpiCard title="MTTA Medio" value={formatDuration(data.kpi.avgMttaMs)} icon={Clock} />
          <KpiCard title="% Ignorabili" value={`${data.kpi.ignorableRatio}%`} icon={EyeOff} />
        </div>
      ) : null}

      {/* Charts */}
      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      ) : data ? (
        <>
          {/* Full-width trend chart */}
          <OccurrenceTrendChart data={data.occurrenceTrend} />

          {/* Two-column breakdown charts */}
          <div className="grid gap-6 md:grid-cols-2">
            <EnvironmentBreakdownChart data={data.byEnvironment} />
            <OperatorBreakdownChart data={data.byOperator} />
          </div>

          {/* Recent analyses */}
          <RecentAnalysesTable data={data.recentAnalyses} />

          {/* Associations: resources, downstreams, ignored alarms */}
          <AlarmAssociations
            topResources={data.topResources}
            topDownstreams={data.topDownstreams}
            ignoredAlarms={data.ignoredAlarms}
          />
        </>
      ) : null}
    </div>
  )
}
