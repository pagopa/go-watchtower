'use client'

import { useState, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, ChevronDown,
  Loader2, Inbox, RefreshCw, AlertTriangle,
} from 'lucide-react'
import { api, type AlarmEvent, type PaginatedResponse } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import type { ColumnDef } from '@/lib/column-registry'
import type { AlarmEventFiltersState } from './alarm-event-filters'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableHeader, TableRow,
} from '@/components/ui/table'
import { ResizableTableHead } from '@/components/ui/resizable-table-head'
import { todayUTC, shiftDay, formatDateLong, localDayBoundsUTC } from '../_lib/date-utils'
import { type BucketCfg, BUCKETS, partitionEvents } from '../_lib/buckets'
import {
  hasRowActions,
  resolveAlarmEventRowState,
  type AlarmEventPermissions,
  type AlarmEventRowPlacement,
} from '../_lib/row-appearance'
import { AlarmEventTableRow } from './alarm-event-table-row'

import type { WorkingHours } from '@go-watchtower/shared'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SelectionProps {
  selectedIds:            Set<string>
  onToggleSelect:         (item: AlarmEvent) => void
  onToggleBucket:         (items: AlarmEvent[]) => void
  isBucketAllSelected:    (items: AlarmEvent[]) => boolean
  isBucketIndeterminate:  (items: AlarmEvent[]) => boolean
}

export interface AlarmEventDailyViewProps {
  selectedDate:    string
  onDateChange:    (d: string) => void
  workingHours:    WorkingHours | null
  filters:         AlarmEventFiltersState
  visibleColumns:  ColumnDef[]
  getWidth:        (id: string) => number | undefined
  totalMinWidth:   number
  permissions:     AlarmEventPermissions
  placement:       AlarmEventRowPlacement
  onRowClick:      (e: AlarmEvent) => void
  onEdit:          (e: AlarmEvent) => void
  onDelete:        (e: AlarmEvent) => void
  onAlarmClick?:   (alarm: NonNullable<AlarmEvent['alarm']>, productId: string) => void
  onCreateAnalysis?:           (e: AlarmEvent) => void
  onCreateIgnorableAnalysis?:  (e: AlarmEvent) => void
  onAssociateAnalysis?:        (e: AlarmEvent) => void
  onUnlinkAnalysis?:           (e: AlarmEvent) => void
  selection:       SelectionProps
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

const VIRTUALIZE_THRESHOLD = 100

export function BucketSection({
  cfg, events, timeRange,
  visibleColumns, getWidth, totalMinWidth,
  permissions, placement,
  onRowClick, onEdit, onDelete, onAlarmClick,
  onCreateAnalysis, onCreateIgnorableAnalysis, onAssociateAnalysis, onUnlinkAnalysis,
  selection,
}: {
  cfg:             BucketCfg
  events:          AlarmEvent[]
  timeRange:       string
  visibleColumns:  ColumnDef[]
  getWidth:        (id: string) => number | undefined
  totalMinWidth:   number
  permissions:     AlarmEventPermissions
  placement:       AlarmEventRowPlacement
  onRowClick:      (e: AlarmEvent) => void
  onEdit:          (e: AlarmEvent) => void
  onDelete:        (e: AlarmEvent) => void
  onAlarmClick?:   (alarm: NonNullable<AlarmEvent['alarm']>, productId: string) => void
  onCreateAnalysis?:           (e: AlarmEvent) => void
  onCreateIgnorableAnalysis?:  (e: AlarmEvent) => void
  onAssociateAnalysis?:        (e: AlarmEvent) => void
  onUnlinkAnalysis?:           (e: AlarmEvent) => void
  selection:       SelectionProps
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

  const hasActions = hasRowActions(permissions)
  const totalColSpan = visibleColumns.length + (hasActions ? 1 : 0) + 1 /* checkbox col */

  const renderRow = (event: AlarmEvent, ref?: (el: HTMLTableRowElement | null) => void, dataIndex?: number) => (
    <AlarmEventTableRow
      key={event.id}
      ref={ref}
      dataIndex={dataIndex}
      event={event}
      state={resolveAlarmEventRowState(event, placement, selection.selectedIds)}
      permissions={permissions}
      visibleColumns={visibleColumns}
      getWidth={getWidth}
      onRowClick={onRowClick}
      onToggleSelect={selection.onToggleSelect}
      onEdit={onEdit}
      onDelete={onDelete}
      onAlarmClick={onAlarmClick}
      onCreateAnalysis={onCreateAnalysis}
      onCreateIgnorableAnalysis={onCreateIgnorableAnalysis}
      onAssociateAnalysis={onAssociateAnalysis}
      onUnlinkAnalysis={onUnlinkAnalysis}
    />
  )

  const bucketAllSelected = selection.isBucketAllSelected(events)
  const bucketIndeterminate = selection.isBucketIndeterminate(events)

  const tableHeader = (
    <TableHeader className={shouldVirtualize ? 'sticky top-0 z-20 bg-card' : ''}>
      <TableRow className="bg-muted/20 hover:bg-muted/20 border-b">
        <ResizableTableHead width={40} minWidth={40}>
          <input
            type="checkbox"
            aria-label="Seleziona tutti in questa sezione"
            className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
            checked={bucketAllSelected}
            ref={(el) => { if (el) el.indeterminate = bucketIndeterminate }}
            onChange={() => selection.onToggleBucket(events)}
          />
        </ResizableTableHead>
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
            width={48}
            minWidth={48}
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
  permissions, placement,
  onRowClick, onEdit, onDelete, onAlarmClick,
  onCreateAnalysis, onCreateIgnorableAnalysis, onAssociateAnalysis, onUnlinkAnalysis,
  selection,
}: AlarmEventDailyViewProps) {
  const wh = workingHours ?? DEFAULT_WH
  const tz = wh.timezone ?? 'Europe/Rome'

  const { dateFrom, dateTo } = localDayBoundsUTC(selectedDate, tz)

  const queryParams = useMemo(() => ({
    page:     1,
    pageSize: 1000,
    ...(filters.environmentIds.length > 0 && { environmentId: filters.environmentIds }),
    ...(filters.awsAccountId  && { awsAccountId:  filters.awsAccountId }),
    ...(filters.awsRegion     && { awsRegion:      filters.awsRegion }),
    ...(filters.hasAnalysis === 'with'    && { hasAnalysis: 'true' as const }),
    ...(filters.hasAnalysis === 'without' && { hasAnalysis: 'false' as const }),
    ...(filters.alarmName && { name: filters.alarmName }),
    dateFrom,
    dateTo,
  }), [filters.environmentIds, filters.awsAccountId, filters.awsRegion, filters.hasAnalysis, filters.alarmName, dateFrom, dateTo])

  const isToday = selectedDate === todayUTC()

  const { data, isLoading, isFetching, refetch } = useQuery<PaginatedResponse<AlarmEvent>>({
    queryKey:             qk.alarmEvents.daily(queryParams),
    queryFn:              () => api.getAlarmEvents(queryParams),
    refetchInterval:      isToday ? 30_000 : false,
    refetchOnWindowFocus: isToday,
  })

  const totalCount = data?.pagination?.totalItems ?? null
  const tooMany    = totalCount !== null && totalCount > 1000

  const { pre, work, post } = useMemo(
    () => partitionEvents(data?.data ?? [], wh),
    [data?.data, wh],
  )

  const bucketProps = { visibleColumns, getWidth, totalMinWidth, permissions, placement,
    onRowClick, onEdit, onDelete, onAlarmClick,
    onCreateAnalysis, onCreateIgnorableAnalysis, onAssociateAnalysis, onUnlinkAnalysis, selection }

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
