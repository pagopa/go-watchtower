'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { MONTH_NAMES } from '@go-watchtower/shared'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  api,
  type Product,
  type MonthlyKpiData,
} from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { downloadCsv, downloadJson } from '@/lib/export-utils'
import { ExportMenu } from './export-menu'
import { ALL_VALUE } from '@/lib/constants'

const ROW_DEFS = [
  { key: 'alarmEvents', label: 'Allarmi scattati', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
  { key: 'completedAnalyses', label: 'Analisi completate', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  { key: 'ignoredAnalyses', label: 'Analisi ignorate', color: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-500/10' },
] as const

interface MonthlyKpiTabProps {
  products?: Product[]
}

export function MonthlyKpiTab({ products }: MonthlyKpiTabProps) {
  const now = new Date()
  const [year, setYear] = useState(() => now.getFullYear())
  const [month, setMonth] = useState(() => now.getMonth() + 1)
  const [productId, setProductId] = useState(ALL_VALUE)

  const activeProducts = useMemo(
    () => products?.filter(p => p.isActive) ?? [],
    [products],
  )

  const selectedProducts = useMemo(
    () => productId === ALL_VALUE ? activeProducts : activeProducts.filter(p => p.id === productId),
    [productId, activeProducts],
  )

  // Single-product query (when a specific product is selected)
  const singleQuery = useQuery<MonthlyKpiData>({
    queryKey: qk.reports.monthlyKpi(productId, year, month),
    queryFn: () => api.getMonthlyKpi({ productId, year, month }),
    enabled: productId !== ALL_VALUE,
  })

  // Multi-product queries (when "all" is selected)
  const multiQueries = useQueries({
    queries: productId === ALL_VALUE
      ? activeProducts.map((p) => ({
          queryKey: qk.reports.monthlyKpi(p.id, year, month),
          queryFn: () => api.getMonthlyKpi({ productId: p.id, year, month }),
        }))
      : [],
  })

  const isAnyLoading = productId === ALL_VALUE
    ? multiQueries.some(q => q.isLoading)
    : singleQuery.isLoading

  const isAnyFetching = productId === ALL_VALUE
    ? multiQueries.some(q => q.isFetching && !q.isLoading)
    : singleQuery.isFetching && !singleQuery.isLoading

  const days = useMemo(() => {
    const count = new Date(year, month, 0).getDate()
    return Array.from({ length: count }, (_, i) => i + 1)
  }, [year, month])

  const handlePrevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }

  const handleNextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  // Today marker
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const today = isCurrentMonth ? now.getDate() : null

  // Weekend check
  const isWeekend = (day: number) => {
    const d = new Date(year, month - 1, day)
    return d.getDay() === 0 || d.getDay() === 6
  }

  // Build the list of product data to render
  const productEntries = useMemo(() => {
    if (productId !== ALL_VALUE) {
      return singleQuery.data
        ? [{ product: selectedProducts[0], data: singleQuery.data }]
        : []
    }
    return activeProducts
      .map((p, i) => ({ product: p, data: multiQueries[i]?.data ?? null }))
      .filter((e): e is { product: Product; data: MonthlyKpiData } => e.data !== null)
  }, [productId, singleQuery.data, activeProducts, multiQueries, selectedProducts])

  // ─── Export helpers ──────────────────────────────────────────────────────
  const flattenForExport = useCallback(() => {
    return productEntries.flatMap(({ product, data }) =>
      data.environments.flatMap((env) =>
        days.map((d) => {
          const ds = String(d)
          return {
            productName: product.name,
            environmentName: env.environmentName,
            day: d,
            alarmEvents: env.alarmEvents[ds] ?? 0,
            completedAnalyses: env.completedAnalyses[ds] ?? 0,
            ignoredAnalyses: env.ignoredAnalyses[ds] ?? 0,
          }
        })
      )
    )
  }, [productEntries, days])

  const handleExportCsv = useCallback(() => {
    const rows = flattenForExport()
    if (rows.length === 0) return
    downloadCsv(rows, [
      { key: 'productName', label: 'Prodotto' },
      { key: 'environmentName', label: 'Ambiente' },
      { key: 'day', label: 'Giorno' },
      { key: 'alarmEvents', label: 'Allarmi scattati' },
      { key: 'completedAnalyses', label: 'Analisi completate' },
      { key: 'ignoredAnalyses', label: 'Analisi ignorate' },
    ], `report-kpi-mensili-${year}-${String(month).padStart(2, '0')}`)
  }, [flattenForExport, year, month])

  const handleExportJson = useCallback(() => {
    if (productEntries.length === 0) return
    const payload = productEntries.map(({ product, data }) => ({
      productId: product.id,
      productName: product.name,
      year: data.year,
      month: data.month,
      environments: data.environments,
    }))
    downloadJson(payload, `report-kpi-mensili-${year}-${String(month).padStart(2, '0')}`)
  }, [productEntries, year, month])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Prodotto</Label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Tutti i prodotti</SelectItem>
              {activeProducts.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[160px] text-center text-sm font-medium">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {isAnyFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

        <div className="ml-auto">
          <ExportMenu
            onExportCsv={handleExportCsv}
            onExportJson={handleExportJson}
            disabled={productEntries.length === 0}
          />
        </div>
      </div>

      {/* Content */}
      {isAnyLoading ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 6 }, (_, n) => n).map(n => (
              <Skeleton key={n} className="h-8 w-full rounded" />
            ))}
          </CardContent>
        </Card>
      ) : productEntries.length > 0 ? (
        <div className="space-y-6">
          {productEntries.map(({ product, data }) => (
            <ProductKpiTable
              key={product.id}
              productName={productId === ALL_VALUE ? product.name : undefined}
              data={data}
              days={days}
              today={today}
              isWeekend={isWeekend}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">
              Nessun dato disponibile per il periodo selezionato
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Single product KPI table ───────────────────────────────────────────────

function ProductKpiTable({ productName, data, days, today, isWeekend }: {
  productName?: string
  data: MonthlyKpiData
  days: number[]
  today: number | null
  isWeekend: (day: number) => boolean
}) {
  const totals = useMemo(() => {
    const map = new Map<string, number>()
    for (const env of data.environments) {
      for (const def of ROW_DEFS) {
        const counts = env[def.key]
        let sum = 0
        for (const d of days) {
          sum += counts[String(d)] ?? 0
        }
        map.set(`${env.environmentId}:${def.key}`, sum)
      }
    }
    return map
  }, [data, days])

  if (data.environments.length === 0) {
    return productName ? (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{productName}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-sm text-muted-foreground">Nessun ambiente configurato</p>
        </CardContent>
      </Card>
    ) : null
  }

  return (
    <Card className="overflow-hidden">
      {productName && (
        <CardHeader className="pb-0 pt-4 px-4">
          <CardTitle className="text-base">{productName}</CardTitle>
        </CardHeader>
      )}
      <CardContent className="p-0 pt-2">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs" style={{ minWidth: `${days.length * 40 + 280}px` }}>
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="sticky left-0 z-20 bg-muted/30 px-3 py-2 text-left text-xs font-semibold w-[200px] min-w-[200px]">
                  Ambiente / Metrica
                </th>
                {days.map((d) => (
                  <th
                    key={d}
                    className={cn(
                      'px-1 py-2 text-center font-medium tabular-nums w-10 min-w-10',
                      d === today && 'bg-primary/10 text-primary font-bold',
                      isWeekend(d) && d !== today && 'text-muted-foreground/50',
                    )}
                  >
                    {d}
                  </th>
                ))}
                <th className="sticky right-0 z-20 bg-muted/30 px-3 py-2 text-center font-semibold w-[60px] min-w-[60px] border-l">
                  Tot
                </th>
              </tr>
            </thead>
            <tbody>
              {data.environments.map((env) => (
                <EnvironmentBlock
                  key={env.environmentId}
                  env={env}
                  days={days}
                  today={today}
                  isWeekend={isWeekend}
                  totals={totals}
                />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Environment block (3 rows per environment) ─────────────────────────────

function EnvironmentBlock({ env, days, today, isWeekend, totals }: {
  env: MonthlyKpiData['environments'][number]
  days: number[]
  today: number | null
  isWeekend: (day: number) => boolean
  totals: Map<string, number>
}) {
  return (
    <>
      {/* Environment header */}
      <tr className="border-t-2 border-border/60">
        <td
          colSpan={days.length + 2}
          className="sticky left-0 z-10 bg-muted/50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-foreground/70"
        >
          {env.environmentName}
        </td>
      </tr>
      {/* Metric rows */}
      {ROW_DEFS.map((def) => {
        const counts = env[def.key]
        const total = totals.get(`${env.environmentId}:${def.key}`) ?? 0
        return (
          <tr key={def.key} className="border-b border-border/30">
            <td className={cn(
              'sticky left-0 z-10 bg-background px-3 py-1.5 text-xs font-medium whitespace-nowrap',
              def.color,
            )}>
              <span className={cn('inline-block rounded px-1.5 py-0.5', def.bg)}>
                {def.label}
              </span>
            </td>
            {days.map((d) => {
              const value = counts[String(d)] ?? 0
              return (
                <td
                  key={d}
                  className={cn(
                    'px-1 py-1.5 text-center tabular-nums',
                    d === today && 'bg-primary/5',
                    isWeekend(d) && d !== today && 'bg-muted/20',
                    value > 0 ? 'font-medium text-foreground' : 'text-muted-foreground/30',
                  )}
                >
                  {value > 0 ? value : '·'}
                </td>
              )
            })}
            <td className={cn(
              'sticky right-0 z-10 bg-background px-3 py-1.5 text-center tabular-nums font-bold border-l',
              total > 0 ? def.color : 'text-muted-foreground/30',
            )}>
              {total}
            </td>
          </tr>
        )
      })}
      {/* Delta row: alarms - (completed + ignored) */}
      <DeltaRow env={env} days={days} today={today} isWeekend={isWeekend} totals={totals} />
    </>
  )
}

// ─── Delta row — highlights days where alarms != completed + ignored ─────────

function DeltaRow({ env, days, today, isWeekend, totals }: {
  env: MonthlyKpiData['environments'][number]
  days: number[]
  today: number | null
  isWeekend: (day: number) => boolean
  totals: Map<string, number>
}) {
  const deltas = days.map((d) => {
    const ds = String(d)
    const alarms = env.alarmEvents[ds] ?? 0
    const completed = env.completedAnalyses[ds] ?? 0
    const ignored = env.ignoredAnalyses[ds] ?? 0
    return alarms - (completed + ignored)
  })

  const hasAnyDelta = deltas.some((d) => d !== 0)
  if (!hasAnyDelta) return null

  const totalAlarms = totals.get(`${env.environmentId}:alarmEvents`) ?? 0
  const totalCompleted = totals.get(`${env.environmentId}:completedAnalyses`) ?? 0
  const totalIgnored = totals.get(`${env.environmentId}:ignoredAnalyses`) ?? 0
  const totalDelta = totalAlarms - (totalCompleted + totalIgnored)

  return (
    <tr className="border-b border-border/30">
      <td className="sticky left-0 z-10 bg-background px-3 py-1.5 text-xs font-medium whitespace-nowrap text-rose-600 dark:text-rose-400">
        <span className="inline-block rounded px-1.5 py-0.5 bg-rose-500/10">
          Da analizzare
        </span>
      </td>
      {days.map((d, i) => {
        const delta = deltas[i]
        return (
          <td
            key={d}
            className={cn(
              'px-1 py-1.5 text-center tabular-nums',
              d === today && 'bg-primary/5',
              isWeekend(d) && d !== today && 'bg-muted/20',
              delta > 0
                ? 'font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10'
                : delta < 0
                  ? 'font-medium text-blue-600 dark:text-blue-400'
                  : 'text-muted-foreground/30',
            )}
            title={delta !== 0 ? `${Math.abs(delta)} allarmi ${delta > 0 ? 'senza analisi' : 'con analisi in più'}` : undefined}
          >
            {delta !== 0 ? (delta > 0 ? `+${delta}` : delta) : '·'}
          </td>
        )
      })}
      <td className={cn(
        'sticky right-0 z-10 bg-background px-3 py-1.5 text-center tabular-nums font-bold border-l',
        totalDelta > 0
          ? 'text-rose-600 dark:text-rose-400'
          : totalDelta < 0
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-muted-foreground/30',
      )}>
        {totalDelta !== 0 ? (totalDelta > 0 ? `+${totalDelta}` : totalDelta) : '0'}
      </td>
    </tr>
  )
}
