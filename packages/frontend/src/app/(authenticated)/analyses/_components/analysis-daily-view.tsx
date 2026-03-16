'use client'

import { useState, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  Loader2, Inbox, AlertTriangle,
} from 'lucide-react'
import {
  api,
  type AlarmAnalysis,
  type PaginatedResponse,
} from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import type { ColumnDef } from '@/lib/column-registry'
import type { AnalysisFiltersState } from './analysis-filters'
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from '@/components/ui/table'
import { ResizableTableHead } from '@/components/ui/resizable-table-head'
import { AnalysisCell } from '../_helpers/cell-renderers'
import { validateAnalysis, assessQuality, type ValidationResult, type QualityResult } from '@/lib/analysis-validation'
import { ValidationScoreBadge } from '@/components/analysis/validation-score-badge'
import { AnalysisRowActions } from './analysis-row-actions'

import type { WorkingHours } from '@go-watchtower/shared'
import {
  type BucketCfg, BUCKETS,
  DayNavigation, localDayBoundsUTC,
  toMinutes, minuteOfDayInTz, isoWeekdayInTz,
} from '../../alarm-events/_components/alarm-event-daily-view'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalysisDailyViewProps {
  selectedDate:      string
  onDateChange:      (d: string) => void
  workingHours:      WorkingHours | null
  filters:           AnalysisFiltersState
  productId:         string
  visibleColumns:    ColumnDef[]
  getWidth:          (id: string) => number | undefined
  totalMinWidth:     number
  canWrite:          boolean
  canDelete:         boolean
  selectedAnalysisId: string | null
  showDetailPanel:   boolean
  lingeringId:       string | null
  onRowClick:        (a: AlarmAnalysis) => void
  onEdit:            (a: AlarmAnalysis) => void
  onDelete:          (a: AlarmAnalysis) => void
  canEditAnalysis:   (a: AlarmAnalysis) => boolean
  canDeleteAnalysis: (a: AlarmAnalysis) => boolean
  isAnalysisLocked:  (a: AlarmAnalysis) => boolean
  lockDays:          number | null
  onValidationClick: (a: AlarmAnalysis) => void
}

// ─── Analysis partitioning ───────────────────────────────────────────────────

function partitionAnalyses(analyses: AlarmAnalysis[], wh: WorkingHours) {
  const tz      = wh.timezone ?? 'Europe/Rome'
  const whStart = toMinutes(wh.start)
  const whEnd   = toMinutes(wh.end)
  const pre: AlarmAnalysis[] = [], work: AlarmAnalysis[] = [], post: AlarmAnalysis[] = []
  for (const a of analyses) {
    const mod       = minuteOfDayInTz(a.analysisDate, tz)
    const weekday   = isoWeekdayInTz(a.analysisDate, tz)
    const isWorkDay = wh.days.includes(weekday)
    if (isWorkDay && mod >= whStart && mod < whEnd) work.push(a)
    else if (isWorkDay && mod < whStart)             pre.push(a)
    else                                             post.push(a)
  }
  return { pre, work, post }
}

// ─── Shared: partition by split timestamp (for oncall view) ──────────────────

export function partitionShiftAnalyses(
  analyses: AlarmAnalysis[],
  splitAt: string | null,
): { oncall: AlarmAnalysis[]; work: AlarmAnalysis[] } {
  if (splitAt === null) return { oncall: analyses, work: [] }
  const splitMs = new Date(splitAt).getTime()
  const oncall: AlarmAnalysis[] = []
  const work:   AlarmAnalysis[] = []
  for (const a of analyses) {
    if (new Date(a.analysisDate).getTime() < splitMs) oncall.push(a)
    else work.push(a)
  }
  return { oncall, work }
}

// ─── Bucket section for analyses ─────────────────────────────────────────────

const VIRTUALIZE_THRESHOLD = 100

export function AnalysisBucketSection({
  cfg, analyses, timeRange,
  visibleColumns, getWidth, totalMinWidth,
  canWrite, canDelete,
  selectedAnalysisId, showDetailPanel, lingeringId,
  onRowClick, onEdit, onDelete,
  canEditAnalysis, canDeleteAnalysis, isAnalysisLocked, lockDays,
  onValidationClick,
}: {
  cfg:                BucketCfg
  analyses:           AlarmAnalysis[]
  timeRange:          string
  visibleColumns:     ColumnDef[]
  getWidth:           (id: string) => number | undefined
  totalMinWidth:      number
  canWrite:           boolean
  canDelete:          boolean
  selectedAnalysisId: string | null
  showDetailPanel:    boolean
  lingeringId:        string | null
  onRowClick:         (a: AlarmAnalysis) => void
  onEdit:             (a: AlarmAnalysis) => void
  onDelete:           (a: AlarmAnalysis) => void
  canEditAnalysis:    (a: AlarmAnalysis) => boolean
  canDeleteAnalysis:  (a: AlarmAnalysis) => boolean
  isAnalysisLocked:   (a: AlarmAnalysis) => boolean
  lockDays:           number | null
  onValidationClick:  (a: AlarmAnalysis) => void
}) {
  const [collapsed, setCollapsed] = useState(analyses.length === 0)
  const { Icon } = cfg
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldVirtualize = analyses.length > VIRTUALIZE_THRESHOLD

  const virtualizer = useVirtualizer({
    count: analyses.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    overscan: 15,
    enabled: shouldVirtualize && !collapsed,
  })

  const validationCache = useMemo(() => {
    return new Map<string, { validation: ValidationResult; quality: QualityResult }>(
      analyses.map((a) => [a.id, { validation: validateAnalysis(a), quality: assessQuality(a) }])
    )
  }, [analyses])

  const hasActions = canWrite || canDelete
  const totalColSpan = visibleColumns.length + (hasActions ? 1 : 0)

  const renderRow = (analysis: AlarmAnalysis, ref?: (el: HTMLTableRowElement | null) => void, dataIndex?: number) => {
    const isSelected  = analysis.id === selectedAnalysisId && showDetailPanel
    const isLingering = analysis.id === lingeringId && !showDetailPanel
    const isOnCall    = analysis.isOnCall
    return (
      <TableRow
        key={analysis.id}
        ref={ref}
        data-index={dataIndex}
        className={
          'group cursor-pointer border-b border-border/50 ' +
          (isSelected
            ? 'analysis-row-selected hover:bg-primary/[0.09]'
            : isLingering
              ? 'analysis-row-lingering hover:bg-muted/30'
              : isOnCall
                ? 'bg-rose-500/[0.04] hover:bg-rose-500/[0.06] transition-colors border-l-[3px] border-l-rose-500/60'
                : 'transition-colors hover:bg-muted/30')
        }
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          onRowClick(analysis)
        }}
      >
        {visibleColumns.map((col, idx) => {
          const isLast = idx === visibleColumns.length - 1
          const cached = col.id === 'validation' ? validationCache.get(analysis.id) : undefined
          return (
            <TableCell
              key={col.id}
              className="overflow-hidden py-2.5"
              style={(!isLast && getWidth(col.id)) ? { width: `${getWidth(col.id)}px` } : undefined}
            >
              {col.id === 'validation' && cached ? (
                <ValidationScoreBadge
                  validation={cached.validation}
                  quality={cached.quality}
                  onClick={() => onValidationClick(analysis)}
                />
              ) : col.id !== 'validation' ? (
                <AnalysisCell columnId={col.id} analysis={analysis} />
              ) : null}
            </TableCell>
          )
        })}
        {hasActions && (
          <TableCell className={
            'relative sticky right-0 z-10 border-l border-border/40 py-2 ' +
            (isSelected
              ? 'bg-primary/[0.07] group-hover:bg-primary/[0.09]'
              : 'bg-card group-hover:bg-muted')
          }>
            <AnalysisRowActions
              analysis={analysis}
              canEdit={canEditAnalysis(analysis)}
              isLocked={isAnalysisLocked(analysis)}
              canDelete={canDeleteAnalysis(analysis)}
              lockDays={lockDays}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </TableCell>
        )}
      </TableRow>
    )
  }

  const tableHeader = (
    <TableHeader className={shouldVirtualize ? 'sticky top-0 z-20 bg-card' : ''}>
      <TableRow className="bg-muted/20 hover:bg-muted/20 border-b">
        {visibleColumns.map((col, idx) => {
          const isLast = idx === visibleColumns.length - 1
          return (
            <ResizableTableHead
              key={col.id}
              width={isLast ? undefined : (getWidth(col.id) ?? col.defaultWidth)}
              minWidth={isLast
                ? (getWidth(col.id) ?? col.defaultWidth ?? col.minWidth)
                : col.minWidth}
            >
              {col.label}
            </ResizableTableHead>
          )
        })}
        {hasActions && (
          <ResizableTableHead
            width={80}
            minWidth={80}
            className="sticky right-0 z-10 border-l border-border/40 bg-muted text-right"
          >
            <span className="sr-only">Azioni</span>
          </ResizableTableHead>
        )}
      </TableRow>
    </TableHeader>
  )

  return (
    <div className={`overflow-hidden rounded-lg border ${cfg.borderCls}`}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className={`flex w-full items-center justify-between px-4 py-2.5 transition-opacity hover:opacity-80 ${cfg.headerCls} ${cfg.textCls}`}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-widest">{cfg.label}</span>
          <span className="font-mono text-xs opacity-55">{timeRange}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums ${cfg.countCls}`}>
            {analyses.length}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
          />
        </div>
      </button>

      {!collapsed && (
        analyses.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground/50">
            <Inbox className="h-4 w-4" />
            Nessuna analisi in questa fascia oraria
          </div>
        ) : shouldVirtualize ? (
          <div
            ref={scrollRef}
            className="overflow-auto border-t"
            style={{ maxHeight: '70vh' }}
          >
            <Table style={{ tableLayout: 'fixed', minWidth: `${totalMinWidth}px` }}>
              {tableHeader}
              <TableBody>
                {virtualizer.getVirtualItems()[0]?.start > 0 && (
                  <tr><td colSpan={totalColSpan} style={{ height: virtualizer.getVirtualItems()[0]!.start, padding: 0 }} /></tr>
                )}
                {virtualizer.getVirtualItems().map((vRow) =>
                  renderRow(analyses[vRow.index]!, virtualizer.measureElement, vRow.index)
                )}
                {(() => {
                  const items = virtualizer.getVirtualItems()
                  const lastEnd = items.at(-1)?.end ?? 0
                  const bottom = virtualizer.getTotalSize() - lastEnd
                  return bottom > 0 ? <tr><td colSpan={totalColSpan} style={{ height: bottom, padding: 0 }} /></tr> : null
                })()}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="overflow-x-auto border-t">
            <Table style={{ tableLayout: 'fixed', minWidth: `${totalMinWidth}px` }}>
              {tableHeader}
              <TableBody>
                {analyses.map((a) => renderRow(a))}
              </TableBody>
            </Table>
          </div>
        )
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

const DEFAULT_WH: WorkingHours = { timezone: 'Europe/Rome', start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] }

export function AnalysisDailyView({
  selectedDate, onDateChange, workingHours, filters, productId,
  visibleColumns, getWidth, totalMinWidth,
  canWrite, canDelete,
  selectedAnalysisId, showDetailPanel, lingeringId,
  onRowClick, onEdit, onDelete,
  canEditAnalysis, canDeleteAnalysis, isAnalysisLocked, lockDays,
  onValidationClick,
}: AnalysisDailyViewProps) {
  const wh = workingHours ?? DEFAULT_WH
  const tz = wh.timezone ?? 'Europe/Rome'

  const { dateFrom, dateTo } = localDayBoundsUTC(selectedDate, tz)

  const queryParams = useMemo(() => ({
    page:      1,
    pageSize:  1000,
    sortBy:    'analysisDate' as const,
    sortOrder: 'desc' as const,
    dateFrom,
    dateTo,
    ...(productId                       && { productId }),
    ...(filters.search                  && { search: filters.search }),
    ...(filters.analysisType            && { analysisType: filters.analysisType }),
    ...(filters.status                  && { status: filters.status }),
    ...(filters.environmentId           && { environmentId: filters.environmentId }),
    ...(filters.operatorId              && { operatorId: filters.operatorId }),
    ...(filters.alarmId                 && { alarmId: filters.alarmId }),
    ...(filters.finalActionId           && { finalActionId: filters.finalActionId }),
    ...(filters.isOnCall !== undefined  && { isOnCall: filters.isOnCall }),
    ...(filters.ignoreReasonCode        && { ignoreReasonCode: filters.ignoreReasonCode }),
    ...(filters.runbookId               && { runbookId: filters.runbookId }),
    ...(filters.resourceId          && { resourceId: filters.resourceId }),
    ...(filters.downstreamId            && { downstreamId: filters.downstreamId }),
    ...(filters.traceId                 && { traceId: filters.traceId }),
  }), [
    dateFrom, dateTo, productId,
    filters.search, filters.analysisType, filters.status,
    filters.environmentId, filters.operatorId, filters.alarmId,
    filters.finalActionId, filters.isOnCall, filters.ignoreReasonCode,
    filters.runbookId, filters.resourceId, filters.downstreamId, filters.traceId,
  ])

  const isToday = selectedDate === new Date().toISOString().slice(0, 10)

  const { data, isLoading, isFetching, refetch } = useQuery<PaginatedResponse<AlarmAnalysis>>({
    queryKey:             qk.analyses.daily(queryParams),
    queryFn:              () => api.getAllAnalyses(queryParams),
    refetchInterval:      isToday ? 30_000 : false,
    refetchOnWindowFocus: isToday,
  })

  const totalCount  = data?.pagination?.totalItems ?? null
  const tooMany     = totalCount !== null && totalCount > 1000

  const { pre, work, post } = useMemo(
    () => partitionAnalyses(data?.data ?? [], wh),
    [data?.data, wh],
  )

  const bucketProps = {
    visibleColumns, getWidth, totalMinWidth, canWrite, canDelete,
    selectedAnalysisId, showDetailPanel, lingeringId,
    onRowClick, onEdit, onDelete,
    canEditAnalysis, canDeleteAnalysis, isAnalysisLocked, lockDays,
    onValidationClick,
  }

  return (
    <div className="space-y-3">
      <DayNavigation
        selectedDate={selectedDate}
        onDateChange={onDateChange}
        isFetching={isFetching}
        onRefresh={() => refetch()}
        totalCount={isLoading ? null : totalCount}
      />

      {tooMany && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-300/60 bg-yellow-50/60 px-3 py-2 text-xs text-yellow-700 dark:border-yellow-800/30 dark:bg-yellow-950/20 dark:text-yellow-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Questo giorno supera le 1000 analisi — sono mostrate solo le prime 1000.
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          <AnalysisBucketSection cfg={BUCKETS.post} analyses={post} timeRange={`${wh.end} – 23:59`} {...bucketProps} />
          <AnalysisBucketSection cfg={BUCKETS.work} analyses={work} timeRange={`${wh.start} – ${wh.end}`} {...bucketProps} />
          <AnalysisBucketSection cfg={BUCKETS.pre}  analyses={pre}  timeRange={`00:00 – ${wh.start}`} {...bucketProps} />
        </div>
      )}
    </div>
  )
}
