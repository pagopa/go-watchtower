'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MONTH_NAMES, MONTH_SHORT_NAMES } from '@go-watchtower/shared'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldCheck,
  Siren,
  PhoneCall,
  FileCheck,
  FileX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { api, type Product, type YearlySummaryData, type YearlySummaryMonth } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { downloadCsv, downloadJson } from '@/lib/export-utils'
import { ExportMenu } from './export-menu'
import { ALL_VALUE } from '@/lib/constants'

// ─── Summary KPI card ────────────────────────────────────────────────────────

function KpiCard({ label, value, subtitle, icon: Icon, color }: {
  label: string
  value: string
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3.5 min-w-0">
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground leading-none truncate">{label}</p>
        <p className="text-lg font-semibold tabular-nums leading-tight mt-0.5">{value}</p>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground leading-none mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  )
}

// ─── Inline coverage bar ─────────────────────────────────────────────────────

function CoverageBar({ value, hasData }: { value: number; hasData: boolean }) {
  if (!hasData) return <span className="text-muted-foreground/40">-</span>

  const clamped = Math.min(value, 100)
  const isGood = value >= 100
  const isWarning = value >= 80 && value < 100
  const isBad = value < 80

  return (
    <div className="flex items-center gap-2 justify-end">
      <span className={cn(
        'text-xs font-semibold tabular-nums',
        isGood && 'text-emerald-600 dark:text-emerald-400',
        isWarning && 'text-amber-600 dark:text-amber-400',
        isBad && 'text-rose-600 dark:text-rose-400',
      )}>
        {value.toFixed(1)}%
      </span>
      <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isGood && 'bg-emerald-500',
            isWarning && 'bg-amber-500',
            isBad && 'bg-rose-500',
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}

// ─── Format helpers ──────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString('it-IT')
}

function fmtPct(n: number, hasData: boolean): string {
  if (!hasData) return '-'
  return `${n.toFixed(1)}%`
}

// ─── Main component ──────────────────────────────────────────────────────────

interface YearlySummaryTabProps {
  products?: Product[]
}

export function YearlySummaryTab({ products }: YearlySummaryTabProps) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [selectedProductId, setSelectedProductId] = useState('')

  const { data, isLoading, isFetching } = useQuery<YearlySummaryData>({
    queryKey: qk.reports.yearlySummary(year, selectedProductId || undefined),
    queryFn: () => api.getYearlySummary(year, selectedProductId || undefined),
  })

  const totals = useMemo(() => {
    if (!data) return null
    return data.months.reduce(
      (acc, m) => ({
        prodAlarmEvents: acc.prodAlarmEvents + m.prodAlarmEvents,
        prodAnalysisOccurrences: acc.prodAnalysisOccurrences + m.prodAnalysisOccurrences,
        prodIgnorableOccurrences: acc.prodIgnorableOccurrences + m.prodIgnorableOccurrences,
        prodOnCallAlarmEvents: acc.prodOnCallAlarmEvents + m.prodOnCallAlarmEvents,
        totalAlarmEvents: acc.totalAlarmEvents + m.totalAlarmEvents,
        totalAnalysisOccurrences: acc.totalAnalysisOccurrences + m.totalAnalysisOccurrences,
        totalIgnorableOccurrences: acc.totalIgnorableOccurrences + m.totalIgnorableOccurrences,
        totalOnCallAlarmEvents: acc.totalOnCallAlarmEvents + m.totalOnCallAlarmEvents,
      }),
      {
        prodAlarmEvents: 0,
        prodAnalysisOccurrences: 0,
        prodIgnorableOccurrences: 0,
        prodOnCallAlarmEvents: 0,
        totalAlarmEvents: 0,
        totalAnalysisOccurrences: 0,
        totalIgnorableOccurrences: 0,
        totalOnCallAlarmEvents: 0,
      },
    )
  }, [data])

  const totalCoverage = totals && totals.prodAlarmEvents > 0
    ? Math.round((totals.prodAnalysisOccurrences / totals.prodAlarmEvents) * 10000) / 100
    : 0

  const totalCoverageAll = totals && totals.totalAlarmEvents > 0
    ? Math.round((totals.totalAnalysisOccurrences / totals.totalAlarmEvents) * 10000) / 100
    : 0

  const prodIgnorablePercent = totals && totals.prodAnalysisOccurrences > 0
    ? Math.round((totals.prodIgnorableOccurrences / totals.prodAnalysisOccurrences) * 10000) / 100
    : 0

  const totalIgnorablePercentAll = totals && totals.totalAnalysisOccurrences > 0
    ? Math.round((totals.totalIgnorableOccurrences / totals.totalAnalysisOccurrences) * 10000) / 100
    : 0

  // ── Export ──────────────────────────────────────────────────────────────────

  const handleExportCsv = useCallback(() => {
    if (!data) return
    const rows = data.months.map((m) => ({
      month: MONTH_NAMES[m.month - 1],
      prodAlarmEvents: m.prodAlarmEvents,
      prodAnalysisOccurrences: m.prodAnalysisOccurrences,
      prodIgnorableOccurrences: m.prodIgnorableOccurrences,
      prodOnCallAlarmEvents: m.prodOnCallAlarmEvents,
      prodIgnorablePercent: m.prodIgnorablePercent,
      prodCoveragePercent: m.prodCoveragePercent,
      totalAlarmEvents: m.totalAlarmEvents,
      totalAnalysisOccurrences: m.totalAnalysisOccurrences,
      totalIgnorableOccurrences: m.totalIgnorableOccurrences,
      totalOnCallAlarmEvents: m.totalOnCallAlarmEvents,
      totalIgnorablePercent: m.totalIgnorablePercent,
      totalCoveragePercent: m.totalCoveragePercent,
    }))
    downloadCsv(rows, [
      { key: 'month', label: 'Mese' },
      { key: 'prodAlarmEvents', label: 'Allarmi Prod' },
      { key: 'prodAnalysisOccurrences', label: 'Analisi Prod (occ.)' },
      { key: 'prodIgnorableOccurrences', label: 'Ignorate Prod (occ.)' },
      { key: 'prodOnCallAlarmEvents', label: 'On-Call Prod' },
      { key: 'prodIgnorablePercent', label: 'Ign. % Prod' },
      { key: 'prodCoveragePercent', label: 'Copertura Prod %' },
      { key: 'totalAlarmEvents', label: 'Allarmi Totali' },
      { key: 'totalAnalysisOccurrences', label: 'Analisi Totali (occ.)' },
      { key: 'totalIgnorableOccurrences', label: 'Ignorate Totali (occ.)' },
      { key: 'totalOnCallAlarmEvents', label: 'On-Call Totali' },
      { key: 'totalIgnorablePercent', label: 'Ign. % Totale' },
      { key: 'totalCoveragePercent', label: 'Copertura Totale %' },
    ], `report-annuale-${year}`)
  }, [data, year])

  const handleExportJson = useCallback(() => {
    if (!data) return
    downloadJson(data, `report-annuale-${year}`)
  }, [data, year])

  const isRefetching = isFetching && !isLoading

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        {/* ── Year selector ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-0.5 rounded-lg border bg-card p-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md" onClick={() => setYear(year - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-[72px] text-center text-sm font-semibold tabular-nums select-none">
              {year}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md" onClick={() => setYear(year + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
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
                {products?.filter(p => p.isActive).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isRefetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

          <div className="ml-auto">
            <ExportMenu
              onExportCsv={handleExportCsv}
              onExportJson={handleExportJson}
              disabled={!data || data.months.length === 0}
            />
          </div>
        </div>

        {/* ── Loading ───────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-[72px] rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-[480px] rounded-lg" />
          </div>
        ) : data && totals ? (
          <>
            {/* ── KPI summary cards ───────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <KpiCard
                label="Copertura Produzione"
                value={totals.prodAlarmEvents > 0 ? `${totalCoverage.toFixed(1)}%` : '-'}
                subtitle={`${fmtNum(totals.prodAnalysisOccurrences)} analisi / ${fmtNum(totals.prodAlarmEvents)} allarmi`}
                icon={ShieldCheck}
                color={
                  totalCoverage >= 100
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : totalCoverage >= 80
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                }
              />
              <KpiCard
                label="Allarmi Produzione"
                value={fmtNum(totals.prodAlarmEvents)}
                icon={Siren}
                color="bg-amber-500/10 text-amber-600 dark:text-amber-400"
              />
              <KpiCard
                label="On-Call Produzione"
                value={fmtNum(totals.prodOnCallAlarmEvents)}
                subtitle={totals.prodAlarmEvents > 0
                  ? `${((totals.prodOnCallAlarmEvents / totals.prodAlarmEvents) * 100).toFixed(1)}% degli allarmi`
                  : undefined}
                icon={PhoneCall}
                color="bg-violet-500/10 text-violet-600 dark:text-violet-400"
              />
              <KpiCard
                label="Analisi Totali"
                value={fmtNum(totals.totalAnalysisOccurrences)}
                subtitle="tutti i prodotti e ambienti"
                icon={FileCheck}
                color="bg-sky-500/10 text-sky-600 dark:text-sky-400"
              />
              <KpiCard
                label="Ignorate Totali"
                value={fmtNum(totals.totalIgnorableOccurrences)}
                subtitle={totals.totalAnalysisOccurrences > 0
                  ? `${((totals.totalIgnorableOccurrences / totals.totalAnalysisOccurrences) * 100).toFixed(1)}% del totale`
                  : undefined}
                icon={FileX}
                color="bg-slate-500/10 text-slate-500 dark:text-slate-400"
              />
            </div>

            {/* ── Data table ──────────────────────────────────────────── */}
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    {/* Grouped header */}
                    <thead>
                      {/* Group row */}
                      <tr className="border-b bg-muted/40">
                        <th className="w-24 px-3 py-2" />
                        <th
                          colSpan={6}
                          className="px-3 py-1.5 text-center text-[11px] font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400 border-x border-amber-200/40 dark:border-amber-800/30 bg-amber-500/[0.04]"
                        >
                          Produzione
                        </th>
                        <th
                          colSpan={6}
                          className="px-3 py-1.5 text-center text-[11px] font-semibold uppercase tracking-widest text-sky-700 dark:text-sky-400 border-l-2 border-border border-r border-sky-200/40 dark:border-sky-800/30 bg-sky-500/[0.04]"
                        >
                          Tutti gli ambienti
                        </th>
                      </tr>
                      {/* Column labels — order: Allarmi, Analisi, Ignorate, On-Call, Ign. %, Copertura */}
                      <tr className="border-b bg-muted/20">
                        <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                          Mese
                        </th>
                        {/* ── Produzione ── */}
                        <HeaderCell tip="Allarmi scattati in produzione (conteggio business-day)">
                          Allarmi
                        </HeaderCell>
                        <HeaderCell tip="Somma occorrenze analisi (completate + ignorate) in ambienti di produzione">
                          Analisi
                        </HeaderCell>
                        <HeaderCell tip="Somma occorrenze analisi da ignorare in produzione" muted>
                          Ignorate
                        </HeaderCell>
                        <HeaderCell tip="Allarmi on-call scattati in produzione">
                          On-Call
                        </HeaderCell>
                        <HeaderCell tip="Percentuale analisi ignorate sul totale analisi di produzione" muted>
                          Ign. %
                        </HeaderCell>
                        <HeaderCell tip="Analisi / Allarmi scattati in produzione">
                          Copertura
                        </HeaderCell>
                        {/* ── Tutti gli ambienti ── */}
                        <HeaderCell tip="Allarmi scattati in tutti i prodotti e ambienti (conteggio business-day)" className="border-l-2 border-border">
                          Allarmi
                        </HeaderCell>
                        <HeaderCell tip="Somma occorrenze analisi per tutti i prodotti e ambienti">
                          Analisi
                        </HeaderCell>
                        <HeaderCell tip="Somma occorrenze analisi da ignorare per tutti i prodotti e ambienti" muted>
                          Ignorate
                        </HeaderCell>
                        <HeaderCell tip="Allarmi on-call scattati in tutti gli ambienti">
                          On-Call
                        </HeaderCell>
                        <HeaderCell tip="Percentuale analisi ignorate sul totale analisi" muted>
                          Ign. %
                        </HeaderCell>
                        <HeaderCell tip="Analisi totali / Allarmi totali scattati">
                          Copertura
                        </HeaderCell>
                      </tr>
                    </thead>
                    <tbody>
                      {data.months.map((m) => (
                        <MonthRow
                          key={m.month}
                          m={m}
                          isCurrentMonth={year === now.getFullYear() && m.month === now.getMonth() + 1}
                          isFutureMonth={year === now.getFullYear() && m.month > now.getMonth() + 1}
                        />
                      ))}
                    </tbody>
                    {/* Totals footer */}
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30">
                        <td className="sticky left-0 z-10 bg-muted/30 px-3 py-2.5 text-xs font-bold uppercase tracking-wide">
                          Totale
                        </td>
                        {/* ── Produzione ── */}
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm font-bold">
                          {fmtNum(totals.prodAlarmEvents)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm font-bold">
                          {fmtNum(totals.prodAnalysisOccurrences)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm font-medium text-muted-foreground">
                          {fmtNum(totals.prodIgnorableOccurrences)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm font-bold">
                          {fmtNum(totals.prodOnCallAlarmEvents)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm font-medium text-muted-foreground">
                          {fmtPct(prodIgnorablePercent, totals.prodAnalysisOccurrences > 0)}
                        </td>
                        <td className="px-3 py-2.5">
                          <CoverageBar value={totalCoverage} hasData={totals.prodAlarmEvents > 0} />
                        </td>
                        {/* ── Tutti gli ambienti ── */}
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm font-bold border-l-2 border-border">
                          {fmtNum(totals.totalAlarmEvents)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm font-bold">
                          {fmtNum(totals.totalAnalysisOccurrences)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm font-medium text-muted-foreground">
                          {fmtNum(totals.totalIgnorableOccurrences)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm font-bold">
                          {fmtNum(totals.totalOnCallAlarmEvents)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-sm font-medium text-muted-foreground">
                          {fmtPct(totalIgnorablePercentAll, totals.totalAnalysisOccurrences > 0)}
                        </td>
                        <td className="px-3 py-2.5">
                          <CoverageBar value={totalCoverageAll} hasData={totals.totalAlarmEvents > 0} />
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="flex items-center justify-center py-16">
              <p className="text-sm text-muted-foreground">
                Nessun dato disponibile per l&apos;anno selezionato
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  )
}

// ─── Table subcomponents ─────────────────────────────────────────────────────

function HeaderCell({ children, tip, muted, className }: {
  children: React.ReactNode
  tip: string
  muted?: boolean
  className?: string
}) {
  return (
    <th className={cn('px-3 py-2 text-right', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(
            'text-xs font-medium cursor-help border-b border-dotted border-muted-foreground/30',
            muted ? 'text-muted-foreground/70' : 'text-muted-foreground',
          )}>
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 text-xs">
          {tip}
        </TooltipContent>
      </Tooltip>
    </th>
  )
}

function MonthRow({ m, isCurrentMonth, isFutureMonth }: {
  m: YearlySummaryMonth
  isCurrentMonth: boolean
  isFutureMonth: boolean
}) {
  const hasData = m.prodAlarmEvents > 0 || m.prodAnalysisOccurrences > 0 || m.totalAnalysisOccurrences > 0 || m.totalAlarmEvents > 0
  const dimmed = isFutureMonth && !hasData

  return (
    <tr className={cn(
      'border-b border-border/50 transition-colors hover:bg-muted/20',
      isCurrentMonth && 'bg-primary/[0.03]',
      dimmed && 'opacity-40',
    )}>
      <td className={cn(
        'sticky left-0 z-10 bg-card px-3 py-2 text-xs font-medium',
        isCurrentMonth && 'bg-primary/[0.03]',
      )}>
        <span className="flex items-center gap-2">
          <span className={cn(
            'inline-block w-5 text-center text-[11px] tabular-nums font-normal text-muted-foreground/60',
          )}>
            {MONTH_SHORT_NAMES[m.month - 1]}
          </span>
          <span>{MONTH_NAMES[m.month - 1]}</span>
          {isCurrentMonth && (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          )}
        </span>
      </td>
      {/* ── Produzione: Allarmi, Analisi, Ignorate, On-Call, Ign. %, Copertura ── */}
      <td className="px-3 py-2 text-right tabular-nums text-sm font-medium">
        {hasData ? fmtNum(m.prodAlarmEvents) : <Dash />}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-sm">
        {hasData ? fmtNum(m.prodAnalysisOccurrences) : <Dash />}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-sm text-muted-foreground">
        {hasData ? fmtNum(m.prodIgnorableOccurrences) : <Dash />}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-sm font-medium">
        {hasData ? fmtNum(m.prodOnCallAlarmEvents) : <Dash />}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-sm text-muted-foreground">
        {fmtPct(m.prodIgnorablePercent, m.prodAnalysisOccurrences > 0)}
      </td>
      <td className="px-3 py-2">
        <CoverageBar value={m.prodCoveragePercent} hasData={m.prodAlarmEvents > 0} />
      </td>
      {/* ── Tutti: Allarmi, Analisi, Ignorate, On-Call, Ign. %, Copertura ── */}
      <td className="px-3 py-2 text-right tabular-nums text-sm font-medium border-l-2 border-border">
        {hasData ? fmtNum(m.totalAlarmEvents) : <Dash />}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-sm">
        {hasData ? fmtNum(m.totalAnalysisOccurrences) : <Dash />}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-sm text-muted-foreground">
        {hasData ? fmtNum(m.totalIgnorableOccurrences) : <Dash />}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-sm font-medium">
        {hasData ? fmtNum(m.totalOnCallAlarmEvents) : <Dash />}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-sm text-muted-foreground">
        {fmtPct(m.totalIgnorablePercent, m.totalAnalysisOccurrences > 0)}
      </td>
      <td className="px-3 py-2">
        <CoverageBar value={m.totalCoveragePercent} hasData={m.totalAlarmEvents > 0} />
      </td>
    </tr>
  )
}

function Dash() {
  return <span className="text-muted-foreground/30">-</span>
}
