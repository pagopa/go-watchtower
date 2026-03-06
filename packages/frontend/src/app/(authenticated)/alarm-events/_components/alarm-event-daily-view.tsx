'use client'

import { useState, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, ChevronDown,
  Moon, Sun, Sunset,
  Loader2, Inbox, RefreshCw, Pencil, Trash2, AlertTriangle,
} from 'lucide-react'
import { api, type AlarmEvent, type PaginatedResponse } from '@/lib/api-client'
import type { ColumnDef } from '@/lib/column-registry'
import type { AlarmEventFiltersState } from './alarm-event-filters'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from '@/components/ui/table'
import { ResizableTableHead } from '@/components/ui/resizable-table-head'
import { AlarmEventCell } from '../_helpers/cell-renderers'

import type { WorkingHours } from '@go-watchtower/shared'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AlarmEventDailyViewProps {
  selectedDate:    string
  onDateChange:    (d: string) => void
  workingHours:    WorkingHours | null
  filters:         AlarmEventFiltersState
  visibleColumns:  ColumnDef[]
  getWidth:        (id: string) => number | undefined
  totalMinWidth:   number
  canWrite:        boolean
  canDelete:       boolean
  selectedEventId: string | null
  showDetailPanel: boolean
  lingeringId:     string | null
  onRowClick:      (e: AlarmEvent) => void
  onEdit:          (e: AlarmEvent) => void
  onDelete:        (e: AlarmEvent) => void
  isOnCallEvent?:  (e: AlarmEvent) => boolean
  onAlarmClick?:   (alarm: NonNullable<AlarmEvent['alarm']>, productId: string) => void
}

// ─── Date utilities ───────────────────────────────────────────────────────────

export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

export function shiftDay(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!, 12))
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

export function formatDateLong(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!, 12))
  const s = date.toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─── Event partitioning ───────────────────────────────────────────────────────

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Minuto del giorno (0–1439) dell'istante ISO nella timezone indicata. */
function minuteOfDayInTz(isoString: string, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(new Date(isoString))
  const h = Number(parts.find((p) => p.type === 'hour')?.value   ?? 0)
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

/** ISO weekday (1=Lun…7=Dom) del giorno locale dell'istante nella timezone indicata. */
function isoWeekdayInTz(isoString: string, tz: string): number {
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(isoString)) // "YYYY-MM-DD"
  const [y, mo, d] = localDate.split('-').map(Number)
  const dow = new Date(Date.UTC(y!, mo! - 1, d!, 12)).getUTCDay()
  return dow === 0 ? 7 : dow
}

/**
 * Restituisce i bound UTC per l'intera giornata locale `dateStr` nella timezone `tz`.
 * Usa come riferimento il noon UTC per stimare l'offset (accurato per offset fissi
 * e per la maggior parte dei casi DST).
 */
export function localDayBoundsUTC(dateStr: string, tz: string): { dateFrom: string; dateTo: string } {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const noonUTC = new Date(Date.UTC(y!, mo! - 1, d!, 12))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(noonUTC)
  const lh = Number(parts.find((p) => p.type === 'hour')?.value   ?? 12)
  const lm = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  const offsetMs = ((lh * 60 + lm) - 12 * 60) * 60_000
  const startMs  = Date.UTC(y!, mo! - 1, d!, 0)  - offsetMs
  const endMs    = Date.UTC(y!, mo! - 1, d!, 24) - offsetMs - 1
  return {
    dateFrom: new Date(startMs).toISOString(),
    dateTo:   new Date(endMs).toISOString(),
  }
}

export function partitionEvents(events: AlarmEvent[], wh: WorkingHours) {
  const tz      = wh.timezone ?? 'Europe/Rome'
  const whStart = toMinutes(wh.start)
  const whEnd   = toMinutes(wh.end)
  const pre: AlarmEvent[] = [], work: AlarmEvent[] = [], post: AlarmEvent[] = []
  for (const e of events) {
    const mod       = minuteOfDayInTz(e.firedAt, tz)
    const weekday   = isoWeekdayInTz(e.firedAt, tz)
    const isWorkDay = wh.days.includes(weekday)
    if (isWorkDay && mod >= whStart && mod < whEnd) work.push(e)
    else if (isWorkDay && mod < whStart)             pre.push(e)
    else                                             post.push(e)
  }
  return { pre, work, post }
}

// ─── Day navigation header ────────────────────────────────────────────────────

export function DayNavigation({
  selectedDate, onDateChange, isFetching, onRefresh, totalCount,
}: {
  selectedDate: string
  onDateChange: (d: string) => void
  isFetching:   boolean
  onRefresh:    () => void
  totalCount:   number | null
}) {
  const today   = todayUTC()
  const isToday = selectedDate === today

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => onDateChange(shiftDay(selectedDate, -1))}
        disabled={isFetching}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Prec.
      </Button>

      <div className="flex items-center gap-2.5">
        <span className="text-sm font-semibold">{formatDateLong(selectedDate)}</span>
        {totalCount !== null && (
          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
            {totalCount}
          </span>
        )}
        {!isToday && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => onDateChange(today)}
            disabled={isFetching}
          >
            Oggi
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onRefresh}
          disabled={isFetching}
          title="Aggiorna"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : 'text-muted-foreground'}`} />
        </Button>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => onDateChange(shiftDay(selectedDate, 1))}
        disabled={isFetching || isToday}
      >
        Succ.
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// ─── Bucket section ───────────────────────────────────────────────────────────

type BucketId = 'pre' | 'work' | 'post'

export interface BucketCfg {
  Icon:        typeof Moon
  label:       string
  headerCls:   string
  textCls:     string
  borderCls:   string
  countCls:    string
}

export const BUCKETS: Record<BucketId, BucketCfg> = {
  pre: {
    Icon:      Moon,
    label:     'Fuori orario — Mattina',
    headerCls: 'bg-slate-50 dark:bg-slate-950/40',
    textCls:   'text-slate-600 dark:text-slate-400',
    borderCls: 'border-slate-200 dark:border-slate-800',
    countCls:  'bg-slate-200/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  work: {
    Icon:      Sun,
    label:     'Orario lavorativo',
    headerCls: 'bg-amber-50 dark:bg-amber-950/20',
    textCls:   'text-amber-700 dark:text-amber-400',
    borderCls: 'border-amber-200/80 dark:border-amber-900/30',
    countCls:  'bg-amber-200/60 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  },
  post: {
    Icon:      Sunset,
    label:     'Fuori orario — Sera',
    headerCls: 'bg-violet-50/70 dark:bg-violet-950/20',
    textCls:   'text-violet-600 dark:text-violet-400',
    borderCls: 'border-violet-200/60 dark:border-violet-900/20',
    countCls:  'bg-violet-200/50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  },
}

const VIRTUALIZE_THRESHOLD = 100

export function BucketSection({
  cfg, events, timeRange,
  visibleColumns, getWidth, totalMinWidth,
  canWrite, canDelete,
  selectedEventId, showDetailPanel, lingeringId,
  onRowClick, onEdit, onDelete, isOnCallEvent, onAlarmClick,
}: {
  cfg:             BucketCfg
  events:          AlarmEvent[]
  timeRange:       string
  visibleColumns:  ColumnDef[]
  getWidth:        (id: string) => number | undefined
  totalMinWidth:   number
  canWrite:        boolean
  canDelete:       boolean
  selectedEventId: string | null
  showDetailPanel: boolean
  lingeringId:     string | null
  onRowClick:      (e: AlarmEvent) => void
  onEdit:          (e: AlarmEvent) => void
  onDelete:        (e: AlarmEvent) => void
  isOnCallEvent?:  (e: AlarmEvent) => boolean
  onAlarmClick?:   (alarm: NonNullable<AlarmEvent['alarm']>, productId: string) => void
}) {
  const [collapsed, setCollapsed] = useState(events.length === 0)
  const { Icon } = cfg
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldVirtualize = events.length > VIRTUALIZE_THRESHOLD

  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    overscan: 15,
    enabled: shouldVirtualize && !collapsed,
  })

  const hasActions = canWrite || canDelete
  const totalColSpan = visibleColumns.length + (hasActions ? 1 : 0)

  const renderRow = (event: AlarmEvent, ref?: (el: HTMLTableRowElement | null) => void, dataIndex?: number) => {
    const isSelected  = event.id === selectedEventId && showDetailPanel
    const isLingering = event.id === lingeringId && !showDetailPanel
    const isOnCall    = isOnCallEvent ? isOnCallEvent(event) : false
    return (
      <TableRow
        key={event.id}
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
          onRowClick(event)
        }}
      >
        {visibleColumns.map((col, idx) => {
          const isLast = idx === visibleColumns.length - 1
          return (
            <TableCell
              key={col.id}
              className="overflow-hidden py-2.5"
              style={(!isLast && getWidth(col.id))
                ? { width: `${getWidth(col.id)}px` }
                : undefined}
            >
              <AlarmEventCell columnId={col.id} event={event} isOnCall={isOnCall} onAlarmClick={onAlarmClick} />
            </TableCell>
          )
        })}
        {hasActions && (
          <TableCell className={
            'sticky right-0 z-10 border-l border-border/40 py-2 text-right ' +
            (isSelected
              ? 'bg-primary/[0.07] group-hover:bg-primary/[0.09]'
              : 'bg-card group-hover:bg-muted')
          }>
            <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              {canWrite && (
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => onEdit(event)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="ghost" size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => onDelete(event)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
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
            {events.length}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
          />
        </div>
      </button>

      {!collapsed && (
        events.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground/50">
            <Inbox className="h-4 w-4" />
            Nessun allarme in questa fascia oraria
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
                  renderRow(events[vRow.index]!, virtualizer.measureElement, vRow.index)
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
                {events.map((event) => renderRow(event))}
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

export function AlarmEventDailyView({
  selectedDate, onDateChange, workingHours, filters,
  visibleColumns, getWidth, totalMinWidth,
  canWrite, canDelete,
  selectedEventId, showDetailPanel, lingeringId,
  onRowClick, onEdit, onDelete, isOnCallEvent, onAlarmClick,
}: AlarmEventDailyViewProps) {
  const wh = workingHours ?? DEFAULT_WH
  const tz = wh.timezone ?? 'Europe/Rome'

  const { dateFrom, dateTo } = localDayBoundsUTC(selectedDate, tz)

  const queryParams = useMemo(() => ({
    page:     1,
    pageSize: 1000,
    ...(filters.productId     && { productId:     filters.productId }),
    ...(filters.environmentId && { environmentId: filters.environmentId }),
    ...(filters.awsAccountId  && { awsAccountId:  filters.awsAccountId }),
    ...(filters.awsRegion     && { awsRegion:      filters.awsRegion }),
    dateFrom,
    dateTo,
  }), [selectedDate, filters.productId, filters.environmentId, filters.awsAccountId, filters.awsRegion, dateFrom, dateTo])

  const isToday = selectedDate === todayUTC()

  const { data, isLoading, isFetching, refetch } = useQuery<PaginatedResponse<AlarmEvent>>({
    queryKey:             ['alarm-events-daily', queryParams],
    queryFn:              () => api.getAlarmEvents(queryParams),
    refetchInterval:      isToday ? 30_000 : false,
    refetchOnWindowFocus: isToday,
  })

  const allEvents  = data?.data ?? []
  const totalCount = data?.pagination?.totalItems ?? null
  const tooMany    = totalCount !== null && totalCount > 1000

  const { pre, work, post } = useMemo(
    () => partitionEvents(allEvents, wh),
    [allEvents, wh],
  )

  const bucketProps = { visibleColumns, getWidth, totalMinWidth, canWrite, canDelete,
    selectedEventId, showDetailPanel, lingeringId, onRowClick, onEdit, onDelete, isOnCallEvent, onAlarmClick }

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
          Questo giorno supera i 1000 eventi — sono mostrati solo i primi 1000.
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          <BucketSection cfg={BUCKETS.post} events={post} timeRange={`${wh.end} – 23:59`} {...bucketProps} />
          <BucketSection cfg={BUCKETS.work} events={work} timeRange={`${wh.start} – ${wh.end}`} {...bucketProps} />
          <BucketSection cfg={BUCKETS.pre}  events={pre}  timeRange={`00:00 – ${wh.start}`} {...bucketProps} />
        </div>
      )}
    </div>
  )
}
