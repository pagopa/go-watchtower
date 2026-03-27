'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  api,
  type Product,
  type DailyActivityData,
  type OperatorDailyActivity,
} from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { downloadCsv, downloadJson } from '@/lib/export-utils'
import { ExportMenu } from './export-menu'
import { ALL_VALUE } from '@/lib/constants'

interface DailyActivityTabProps {
  products?: Product[]
}

export function DailyActivityTab({ products }: DailyActivityTabProps) {
  const now = new Date()
  const [year, setYear] = useState(() => now.getFullYear())
  const [month, setMonth] = useState(() => now.getMonth() + 1)
  const [productId, setProductId] = useState(ALL_VALUE)

  const activeProducts = useMemo(
    () => products?.filter(p => p.isActive) ?? [],
    [products],
  )

  const filters = useMemo(() => ({
    year,
    month,
    ...(productId !== ALL_VALUE ? { productId } : {}),
  }), [year, month, productId])

  const { data, isLoading, isFetching } = useQuery<DailyActivityData>({
    queryKey: qk.reports.dailyActivity(year, month, productId !== ALL_VALUE ? productId : undefined),
    queryFn: () => api.getDailyActivity(filters),
  })

  const handlePrevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }

  const handleNextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const days = useMemo(() => {
    const count = new Date(year, month, 0).getDate()
    return Array.from({ length: count }, (_, i) => i + 1)
  }, [year, month])

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const today = isCurrentMonth ? now.getDate() : null

  const isWeekend = (day: number) => {
    const d = new Date(year, month - 1, day)
    return d.getDay() === 0 || d.getDay() === 6
  }

  // Grand totals per day (sum of all operators)
  const dailyTotals = useMemo(() => {
    if (!data) return new Map<string, number>()
    const map = new Map<string, number>()
    for (const op of data.operators) {
      for (const [dayKey, dayData] of Object.entries(op.byDay)) {
        map.set(dayKey, (map.get(dayKey) ?? 0) + dayData.total)
      }
    }
    return map
  }, [data])

  const grandTotal = useMemo(() => {
    let sum = 0
    for (const v of dailyTotals.values()) sum += v
    return sum
  }, [dailyTotals])

  // Stable color assignment per product across all operators
  const productColorMap = useMemo(() => {
    if (!data) return new Map<string, number>()
    const ids = new Set<string>()
    for (const op of data.operators) {
      for (const day of Object.values(op.byDay)) {
        for (const p of day.products) ids.add(p.productId)
      }
    }
    const map = new Map<string, number>()
    let i = 0
    for (const id of ids) map.set(id, i++)
    return map
  }, [data])

  // ─── Export helpers ──────────────────────────────────────────────────────
  const flattenForExport = useCallback(() => {
    if (!data) return []
    return data.operators.flatMap((op) =>
      days.map((d) => {
        const dayData = op.byDay[String(d)]
        return {
          operatorName: op.operatorName,
          day: d,
          total: dayData?.total ?? 0,
          analyzable: dayData?.analyzable ?? 0,
          ignorable: dayData?.ignorable ?? 0,
          products: dayData?.products.map(p => `${p.productName} (${p.count})`).join(', ') ?? '',
        }
      })
    )
  }, [data, days])

  const handleExportCsv = useCallback(() => {
    const rows = flattenForExport()
    if (rows.length === 0) return
    downloadCsv(rows, [
      { key: 'operatorName', label: 'Operatore' },
      { key: 'day', label: 'Giorno' },
      { key: 'total', label: 'Totale' },
      { key: 'analyzable', label: 'Analizzabili' },
      { key: 'ignorable', label: 'Ignorabili' },
      { key: 'products', label: 'Prodotti' },
    ], `report-timesheet-${year}-${String(month).padStart(2, '0')}`)
  }, [flattenForExport, year, month])

  const handleExportJson = useCallback(() => {
    if (!data) return
    downloadJson(data, `report-timesheet-${year}-${String(month).padStart(2, '0')}`)
  }, [data, year, month])

  const isBgFetching = isFetching && !isLoading

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

        {isBgFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

        <div className="ml-auto">
          <ExportMenu
            onExportCsv={handleExportCsv}
            onExportJson={handleExportJson}
            disabled={!data || data.operators.length === 0}
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 6 }, (_, n) => n).map(n => (
              <Skeleton key={n} className="h-8 w-full rounded" />
            ))}
          </CardContent>
        </Card>
      ) : data && data.operators.length > 0 ? (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs" style={{ minWidth: `${days.length * 40 + 280}px` }}>
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="sticky left-0 z-20 bg-muted/30 px-3 py-2 text-left text-xs font-semibold w-[200px] min-w-[200px]">
                        Operatore
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
                    {data.operators.map((op) => (
                      <OperatorBlock
                        key={op.operatorId}
                        operator={op}
                        days={days}
                        today={today}
                        isWeekend={isWeekend}
                        productColorMap={productColorMap}
                      />
                    ))}
                    {/* Grand total row */}
                    <tr className="border-t-2 border-border/60 bg-muted/30 font-bold">
                      <td className="sticky left-0 z-10 bg-muted/30 px-3 py-2 text-xs font-bold uppercase tracking-wider">
                        Totale
                      </td>
                      {days.map((d) => {
                        const value = dailyTotals.get(String(d)) ?? 0
                        return (
                          <td
                            key={d}
                            className={cn(
                              'px-1 py-2 text-center tabular-nums',
                              d === today && 'bg-primary/5',
                              isWeekend(d) && d !== today && 'bg-muted/20',
                              value > 0 ? 'font-bold text-foreground' : 'text-muted-foreground/30',
                            )}
                          >
                            {value > 0 ? value : '\u00B7'}
                          </td>
                        )
                      })}
                      <td className="sticky right-0 z-10 bg-muted/30 px-3 py-2 text-center tabular-nums font-bold border-l">
                        {grandTotal}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
          </CardContent>
        </Card>
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

// ─── Color palette for product sub-rows ────────────────────────────────────

const PRODUCT_COLORS = [
  { color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/10' },
  { color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10' },
  { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
  { color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  { color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10' },
  { color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-500/10' },
  { color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10' },
  { color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/10' },
] as const

// ─── Operator block (header + product sub-rows) ───────────────────────────

function OperatorBlock({ operator, days, today, isWeekend, productColorMap }: {
  operator: OperatorDailyActivity
  days: number[]
  today: number | null
  isWeekend: (day: number) => boolean
  productColorMap: Map<string, number>
}) {
  // Collect all products this operator touched during the month
  const productRows = useMemo(() => {
    const map = new Map<string, { productId: string; productName: string; byDay: Map<string, number>; total: number }>()
    for (const [dayKey, dayData] of Object.entries(operator.byDay)) {
      for (const p of dayData.products) {
        if (!map.has(p.productId)) {
          map.set(p.productId, { productId: p.productId, productName: p.productName, byDay: new Map(), total: 0 })
        }
        const entry = map.get(p.productId)!
        entry.byDay.set(dayKey, (entry.byDay.get(dayKey) ?? 0) + p.count)
        entry.total += p.count
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [operator])

  return (
    <>
      {/* Operator header row — totals */}
      <tr className="border-t-2 border-border/60">
        <td className="sticky left-0 z-10 bg-muted/50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-foreground/70">
          {operator.operatorName}
        </td>
        {days.map((d) => {
          const value = operator.byDay[String(d)]?.total ?? 0
          return (
            <td
              key={d}
              className={cn(
                'bg-muted/50 px-1 py-1.5 text-center tabular-nums',
                d === today && 'bg-primary/10',
                isWeekend(d) && d !== today && 'bg-muted/70',
                value > 0 ? 'font-bold text-foreground' : 'text-muted-foreground/30',
              )}
            >
              {value > 0 ? value : '\u00B7'}
            </td>
          )
        })}
        <td className={cn(
          'sticky right-0 z-10 bg-muted/50 px-3 py-1.5 text-center tabular-nums font-bold border-l',
          operator.monthTotal > 0 ? 'text-foreground' : 'text-muted-foreground/30',
        )}>
          {operator.monthTotal}
        </td>
      </tr>
      {/* Product sub-rows */}
      {productRows.map((prod) => {
        const colorIdx = (productColorMap.get(prod.productId) ?? 0) % PRODUCT_COLORS.length
        const palette = PRODUCT_COLORS[colorIdx]
        return (
          <tr key={prod.productId} className="border-b border-border/30">
            <td className={cn(
              'sticky left-0 z-10 bg-background px-3 py-1.5 text-xs font-medium whitespace-nowrap pl-6',
              palette.color,
            )}>
              <span className={cn('inline-block rounded px-1.5 py-0.5', palette.bg)}>
                {prod.productName}
              </span>
            </td>
            {days.map((d) => {
              const value = prod.byDay.get(String(d)) ?? 0
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
                  {value > 0 ? value : '\u00B7'}
                </td>
              )
            })}
            <td className={cn(
              'sticky right-0 z-10 bg-background px-3 py-1.5 text-center tabular-nums font-bold border-l',
              prod.total > 0 ? palette.color : 'text-muted-foreground/30',
            )}>
              {prod.total}
            </td>
          </tr>
        )
      })}
    </>
  )
}
