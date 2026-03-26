'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Users, BarChart3, CalendarDays, CalendarRange, TrendingDown } from 'lucide-react'
import { usePermissions } from '@/hooks/use-permissions'
import { api, type Product } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

const OperatorWorkloadTab = dynamic(
  () => import('./_components/operator-workload-tab').then(m => m.OperatorWorkloadTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
)

const AlarmRankingTab = dynamic(
  () => import('./_components/alarm-ranking-tab').then(m => m.AlarmRankingTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
)

const MonthlyKpiTab = dynamic(
  () => import('./_components/monthly-kpi-tab').then(m => m.MonthlyKpiTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
)

const YearlySummaryTab = dynamic(
  () => import('./_components/yearly-summary-tab').then(m => m.YearlySummaryTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
)

const MttaTrendTab = dynamic(
  () => import('./_components/mtta-trend-tab').then(m => m.MttaTrendTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
)

const REPORTS = [
  {
    id: 'operators',
    label: 'Carico operatori',
    description: 'Analisi per operatore, suddivise per ambiente',
    icon: Users,
  },
  {
    id: 'alarms',
    label: 'Classifica allarmi',
    description: 'Allarmi ordinati per frequenza e occorrenze',
    icon: BarChart3,
  },
  {
    id: 'monthly-kpi',
    label: 'KPI Mensili',
    description: 'Conteggi giornalieri per ambiente e mese',
    icon: CalendarDays,
  },
  {
    id: 'yearly-summary',
    label: 'Riepilogo Annuale',
    description: 'Metriche mensili produzione e totali',
    icon: CalendarRange,
  },
  {
    id: 'mtta-trend',
    label: 'Trend MTTA',
    description: 'Andamento MTTA medio e mediano nel tempo',
    icon: TrendingDown,
  },
] as const

type ReportId = typeof REPORTS[number]['id']

export function ReportsPageContent() {
  const { can, isLoading: permissionsLoading } = usePermissions()
  const canReadAnalyses = permissionsLoading || can('ALARM_ANALYSIS', 'read')

  const [activeReport, setActiveReport] = useState<ReportId>('operators')

  const { data: products } = useQuery<Product[]>({
    queryKey: qk.products.list,
    queryFn: api.getProducts,
    enabled: canReadAnalyses,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Report</h1>
        <p className="text-muted-foreground">
          Report dettagliati su operatori e allarmi
        </p>
      </div>

      {canReadAnalyses && (
        <>
          {/* Report selector */}
          <div className="flex gap-2 flex-wrap">
            {REPORTS.map((report) => {
              const Icon = report.icon
              const isActive = activeReport === report.id
              return (
                <button
                  key={report.id}
                  onClick={() => setActiveReport(report.id)}
                  className={cn(
                    'group flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all',
                    isActive
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border/50 bg-card hover:border-border hover:bg-accent/50',
                  )}
                >
                  <div className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground group-hover:text-foreground',
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className={cn(
                      'text-sm font-medium leading-tight',
                      isActive ? 'text-primary' : 'text-foreground',
                    )}>
                      {report.label}
                    </div>
                    <div className="text-xs text-muted-foreground leading-tight mt-0.5 hidden sm:block">
                      {report.description}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Active report content */}
          <div>
            {activeReport === 'operators' && (
              <OperatorWorkloadTab products={products} />
            )}
            {activeReport === 'alarms' && (
              <AlarmRankingTab products={products} />
            )}
            {activeReport === 'monthly-kpi' && (
              <MonthlyKpiTab products={products} />
            )}
            {activeReport === 'yearly-summary' && (
              <YearlySummaryTab products={products} />
            )}
            {activeReport === 'mtta-trend' && (
              <MttaTrendTab products={products} />
            )}
          </div>
        </>
      )}
    </div>
  )
}
