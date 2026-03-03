'use client'

import { memo } from 'react'
import { FileBarChart, Hash, CheckCircle, User } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { KpiStats } from '@/lib/api-client'

interface KpiSummaryCardsProps {
  data: KpiStats | undefined
  isLoading: boolean
}

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null
  const pct = ((current - previous) / previous) * 100
  if (pct === 0) return null
  const isUp = pct > 0
  // In incident management context: increase = bad (red), decrease = good (green)
  return (
    <span className={`text-xs font-medium ${isUp ? 'text-red-600' : 'text-green-600'}`}>
      {isUp ? '+' : ''}{pct.toFixed(0)}%
    </span>
  )
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  trend?: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{value}</p>
              {trend}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground truncate max-w-[180px]">{subtitle}</p>
            )}
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
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-11 w-11 rounded-full" />
        </div>
      </CardContent>
    </Card>
  )
}

export const KpiSummaryCards = memo(function KpiSummaryCards({ data, isLoading }: KpiSummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        title="Analisi Totali"
        value={data.totalAnalyses}
        icon={FileBarChart}
        trend={
          <TrendBadge current={data.totalAnalyses} previous={data.totalAnalysesPrevious} />
        }
      />
      <KpiCard
        title="Occorrenze Totali"
        value={data.totalOccurrences}
        icon={Hash}
        trend={
          <TrendBadge current={data.totalOccurrences} previous={data.totalOccurrencesPrevious} />
        }
      />
      <KpiCard
        title="Azione Finale Principale"
        value={data.topFinalAction?.count ?? '–'}
        subtitle={data.topFinalAction?.name}
        icon={CheckCircle}
      />
      <KpiCard
        title="Top Operatore"
        value={data.topOperator?.count ?? '–'}
        subtitle={data.topOperator?.name}
        icon={User}
      />
    </div>
  )
})
