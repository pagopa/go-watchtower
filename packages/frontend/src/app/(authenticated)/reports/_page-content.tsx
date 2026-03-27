'use client'

import Link from 'next/link'
import { Users, BarChart3, CalendarDays, CalendarRange, TrendingDown, CalendarClock, ArrowRight } from 'lucide-react'
import { usePermissions } from '@/hooks/use-permissions'

const REPORTS = [
  {
    href: '/reports/monthly-kpi',
    label: 'KPI Mensili',
    description: 'Conteggi giornalieri per ambiente e mese',
    icon: CalendarDays,
  },
  {
    href: '/reports/yearly-summary',
    label: 'Riepilogo Annuale',
    description: 'Metriche mensili produzione e totali',
    icon: CalendarRange,
  },
  {
    href: '/reports/alarms',
    label: 'Classifica allarmi',
    description: 'Allarmi ordinati per frequenza e occorrenze',
    icon: BarChart3,
  },
  {
    href: '/reports/mtta-trend',
    label: 'Trend MTTA/MTTR',
    description: 'Andamento tempi di presa in carico e risoluzione',
    icon: TrendingDown,
  },
  {
    href: '/reports/operators',
    label: 'Carico operatori',
    description: 'Analisi per operatore, suddivise per ambiente',
    icon: Users,
  },
  {
    href: '/reports/daily-activity',
    label: 'Timesheet',
    description: 'Attività giornaliera degli operatori per mese e prodotto',
    icon: CalendarClock,
  },
] as const

export function ReportsPageContent() {
  const { can, isLoading } = usePermissions()
  const canRead = isLoading || can('ALARM_ANALYSIS', 'read')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Report</h1>
        <p className="text-muted-foreground">
          Seleziona un report per visualizzarlo
        </p>
      </div>

      {canRead && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {REPORTS.map((report) => {
            const Icon = report.icon
            return (
              <Link
                key={report.href}
                href={report.href}
                className="group flex flex-col gap-3 rounded-lg border border-border/50 bg-card p-5 transition-all hover:border-border hover:bg-accent/50 hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/0 transition-all group-hover:text-muted-foreground group-hover:translate-x-0.5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{report.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {report.description}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
