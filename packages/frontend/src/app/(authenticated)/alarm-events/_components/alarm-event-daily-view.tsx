'use client'

import { useState, useMemo } from 'react'
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
import { renderCell } from '../_helpers/cell-renderers'

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

function minuteOfDayUTC(isoString: string): number {
  const d = new Date(isoString)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

function isoWeekdayUTC(isoString: string): number {
  const d = new Date(isoString)
  const day = d.getUTCDay()
  return day === 0 ? 7 : day
}

function partitionEvents(events: AlarmEvent[], wh: WorkingHours) {
  const pre: AlarmEvent[] = [], work: AlarmEvent[] = [], post: AlarmEvent[] = []
  const whStart = toMinutes(wh.start)
  const whEnd   = toMinutes(wh.end)
  for (const e of events) {
    const mod     = minuteOfDayUTC(e.firedAt)
    const weekday = isoWeekdayUTC(e.firedAt)
    const isWorkDay = wh.days.includes(weekday)
    if (isWorkDay && mod >= whStart && mod < whEnd) work.push(e)
    else if (isWorkDay && mod < whStart)             pre.push(e)
    else                                             post.push(e)
  }
  return { pre, work, post }
}

// ─── Day navigation header ────────────────────────────────────────────────────

function DayNavigation({
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

const BUCKETS: Record<BucketId, BucketCfg> = {
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

export function BucketSection({
  cfg, events, timeRange,
  visibleColumns, getWidth, totalMinWidth,
  canWrite, canDelete,
  selectedEventId, showDetailPanel, lingeringId,
  onRowClick, onEdit, onDelete,
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
}) {
  const [collapsed, setCollapsed] = useState(events.length === 0)
  const { Icon } = cfg

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
        ) : (
          <div className="overflow-x-auto border-t">
            <Table style={{ tableLayout: 'fixed', minWidth: `${totalMinWidth}px` }}>
              <TableHeader>
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
                  {(canWrite || canDelete) && (
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
              <TableBody>
                {events.map((event) => {
                  const isSelected  = event.id === selectedEventId && showDetailPanel
                  const isLingering = event.id === lingeringId && !showDetailPanel
                  return (
                    <TableRow
                      key={event.id}
                      className={
                        'group cursor-pointer border-b border-border/50 ' +
                        (isSelected
                          ? 'analysis-row-selected hover:bg-primary/[0.09]'
                          : isLingering
                            ? 'analysis-row-lingering hover:bg-muted/30'
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
                            {renderCell(col.id, event)}
                          </TableCell>
                        )
                      })}
                      {(canWrite || canDelete) && (
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
                })}
              </TableBody>
            </Table>
          </div>
        )
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

const DEFAULT_WH: WorkingHours = { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] }

export function AlarmEventDailyView({
  selectedDate, onDateChange, workingHours, filters,
  visibleColumns, getWidth, totalMinWidth,
  canWrite, canDelete,
  selectedEventId, showDetailPanel, lingeringId,
  onRowClick, onEdit, onDelete,
}: AlarmEventDailyViewProps) {
  const wh = workingHours ?? DEFAULT_WH

  const dateFrom = `${selectedDate}T00:00:00.000Z`
  const dateTo   = `${selectedDate}T23:59:59.999Z`

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

  const { data, isLoading, isFetching, refetch } = useQuery<PaginatedResponse<AlarmEvent>>({
    queryKey:             ['alarm-events-daily', queryParams],
    queryFn:              () => api.getAlarmEvents(queryParams),
    refetchInterval:      30_000,
    refetchOnWindowFocus: true,
  })

  const allEvents  = data?.data ?? []
  const totalCount = data?.pagination?.totalItems ?? null
  const tooMany    = totalCount !== null && totalCount > 1000

  const { pre, work, post } = useMemo(
    () => partitionEvents(allEvents, wh),
    [allEvents, wh],
  )

  const bucketProps = { visibleColumns, getWidth, totalMinWidth, canWrite, canDelete,
    selectedEventId, showDetailPanel, lingeringId, onRowClick, onEdit, onDelete }

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
