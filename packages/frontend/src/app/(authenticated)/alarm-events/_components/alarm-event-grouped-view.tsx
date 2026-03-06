'use client'

import { useState, useMemo, useRef, forwardRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown, ChevronRight,
  Loader2, AlertTriangle,
} from 'lucide-react'
import { api, type AlarmEvent, type PaginatedResponse } from '@/lib/api-client'
import type { ColumnDef } from '@/lib/column-registry'
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from '@/components/ui/table'
import { ResizableTableHead } from '@/components/ui/resizable-table-head'
import { AlarmEventCell } from '../_helpers/cell-renderers'
import type { AlarmEventOnCallViewProps } from './alarm-event-oncall-view'
import {
  todayUTC,
  type BucketCfg,
} from './alarm-event-daily-view'
import {
  ONCALL_BUCKETS, partitionShiftEvents,
  buildShiftRange, isOnCallAllDay, OnCallNavigation,
} from './alarm-event-oncall-view'
import { Inbox } from 'lucide-react'
import { AlarmEventRowActions } from './alarm-event-row-actions'

import type { WorkingHours } from '@go-watchtower/shared'

// ── Types ────────────────────────────────────────────────────────────────────

export type AlarmEventGroupedViewProps = AlarmEventOnCallViewProps

interface AlarmGroup {
  alarmName: string
  events: AlarmEvent[]
}

// ── Grouping logic ───────────────────────────────────────────────────────────

function groupByAlarmName(events: AlarmEvent[]): AlarmGroup[] {
  const map = new Map<string, AlarmEvent[]>()
  for (const e of events) {
    const key = e.name
    const arr = map.get(key)
    if (arr) arr.push(e)
    else map.set(key, [e])
  }
  const groups: AlarmGroup[] = []
  for (const [alarmName, evts] of map) {
    // Sort events within group by firedAt ascending
    evts.sort((a, b) => new Date(a.firedAt).getTime() - new Date(b.firedAt).getTime())
    groups.push({ alarmName, events: evts })
  }
  // Sort groups: multi-event groups first (by count desc), then singles by date
  groups.sort((a, b) => {
    if (a.events.length > 1 && b.events.length <= 1) return -1
    if (a.events.length <= 1 && b.events.length > 1) return 1
    if (a.events.length > 1 && b.events.length > 1) return b.events.length - a.events.length
    return new Date(a.events[0]!.firedAt).getTime() - new Date(b.events[0]!.firedAt).getTime()
  })
  return groups
}

// ── Group row (collapsible header for 2+ events) ─────────────────────────────

const GroupHeaderRow = forwardRef<HTMLTableRowElement, {
  group: AlarmGroup
  colSpan: number
  expanded: boolean
  onToggle: () => void
  bucketCfg: BucketCfg
  dataIndex?: number
}>(function GroupHeaderRow({ group, colSpan, expanded, onToggle, bucketCfg, dataIndex }, ref) {
  return (
    <TableRow
      ref={ref}
      data-index={dataIndex}
      className="cursor-pointer border-b border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors"
      onClick={onToggle}
    >
      <TableCell colSpan={colSpan} className="py-2 px-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-5 w-5 items-center justify-center rounded transition-colors">
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            }
          </span>
          <span className="text-sm font-medium truncate">{group.alarmName}</span>
          <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${bucketCfg.countCls}`}>
            {group.events.length}
          </span>
        </div>
      </TableCell>
    </TableRow>
  )
})

// ── Event row (single event, optionally indented when inside a group) ────────

const EventRow = forwardRef<HTMLTableRowElement, {
  event: AlarmEvent
  visibleColumns: ColumnDef[]
  getWidth: (id: string) => number | undefined
  canWrite: boolean
  canDelete: boolean
  selectedEventId: string | null
  showDetailPanel: boolean
  lingeringId: string | null
  onRowClick: (e: AlarmEvent) => void
  onEdit: (e: AlarmEvent) => void
  onDelete: (e: AlarmEvent) => void
  isOnCallEvent?: (e: AlarmEvent) => boolean
  onAlarmClick?: (alarm: NonNullable<AlarmEvent['alarm']>, productId: string) => void
  onCreateAnalysis?: (e: AlarmEvent) => void
  onAssociateAnalysis?: (e: AlarmEvent) => void
  onUnlinkAnalysis?: (e: AlarmEvent) => void
  indented?: boolean
  dataIndex?: number
}>(function EventRow({
  event, visibleColumns, getWidth, canWrite, canDelete,
  selectedEventId, showDetailPanel, lingeringId,
  onRowClick, onEdit, onDelete, isOnCallEvent, onAlarmClick,
  onCreateAnalysis, onAssociateAnalysis, onUnlinkAnalysis,
  indented, dataIndex,
}, ref) {
  const isSelected  = event.id === selectedEventId && showDetailPanel
  const isLingering = event.id === lingeringId && !showDetailPanel
  const isOnCall    = isOnCallEvent ? isOnCallEvent(event) : false

  return (
    <TableRow
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
              ? { width: `${getWidth(col.id)}px`, ...(indented && idx === 0 ? { paddingLeft: '2rem' } : {}) }
              : (indented && idx === 0 ? { paddingLeft: '2rem' } : undefined)}
          >
            <AlarmEventCell columnId={col.id} event={event} isOnCall={isOnCall} onAlarmClick={onAlarmClick} />
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
          <AlarmEventRowActions
            event={event}
            canWrite={canWrite}
            canDelete={canDelete}
            onEdit={onEdit}
            onDelete={onDelete}
            onCreateAnalysis={onCreateAnalysis}
            onAssociateAnalysis={onAssociateAnalysis}
            onUnlinkAnalysis={onUnlinkAnalysis}
          />
        </TableCell>
      )}
    </TableRow>
  )
})

// ── Flat item types for virtualization ────────────────────────────────────────

type FlatItem =
  | { type: 'single'; event: AlarmEvent }
  | { type: 'groupHeader'; group: AlarmGroup; expanded: boolean }
  | { type: 'groupEvent'; event: AlarmEvent }

const VIRTUALIZE_THRESHOLD = 100

// ── Grouped bucket section ───────────────────────────────────────────────────

function GroupedBucketSection({
  cfg, events, timeRange,
  visibleColumns, getWidth, totalMinWidth,
  canWrite, canDelete,
  selectedEventId, showDetailPanel, lingeringId,
  onRowClick, onEdit, onDelete, isOnCallEvent, onAlarmClick,
  onCreateAnalysis, onAssociateAnalysis, onUnlinkAnalysis,
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
  onCreateAnalysis?:    (e: AlarmEvent) => void
  onAssociateAnalysis?: (e: AlarmEvent) => void
  onUnlinkAnalysis?:    (e: AlarmEvent) => void
}) {
  const [collapsed, setCollapsed] = useState(events.length === 0)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const { Icon } = cfg
  const scrollRef = useRef<HTMLDivElement>(null)

  const groups = useMemo(() => groupByAlarmName(events), [events])

  const toggleGroup = (alarmName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(alarmName)) next.delete(alarmName)
      else next.add(alarmName)
      return next
    })
  }

  const hasActions = canWrite || canDelete
  const totalColSpan = visibleColumns.length + (hasActions ? 1 : 0)

  // Flatten groups into a virtual list
  const flatItems = useMemo((): FlatItem[] => {
    const items: FlatItem[] = []
    for (const group of groups) {
      if (group.events.length === 1) {
        items.push({ type: 'single', event: group.events[0]! })
      } else {
        const expanded = expandedGroups.has(group.alarmName)
        items.push({ type: 'groupHeader', group, expanded })
        if (expanded) {
          for (const event of group.events) {
            items.push({ type: 'groupEvent', event })
          }
        }
      }
    }
    return items
  }, [groups, expandedGroups])

  const shouldVirtualize = flatItems.length > VIRTUALIZE_THRESHOLD

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    overscan: 15,
    enabled: shouldVirtualize && !collapsed,
  })

  const rowProps = {
    visibleColumns, getWidth, canWrite, canDelete,
    selectedEventId, showDetailPanel, lingeringId,
    onRowClick, onEdit, onDelete, isOnCallEvent, onAlarmClick,
    onCreateAnalysis, onAssociateAnalysis, onUnlinkAnalysis,
  }

  const renderFlatItem = (item: FlatItem, ref?: (el: HTMLTableRowElement | null) => void, dataIndex?: number) => {
    switch (item.type) {
      case 'single':
        return <EventRow key={item.event.id} event={item.event} ref={ref} dataIndex={dataIndex} {...rowProps} />
      case 'groupHeader':
        return (
          <GroupHeaderRow
            key={`group-${item.group.alarmName}`}
            group={item.group}
            colSpan={totalColSpan}
            expanded={item.expanded}
            onToggle={() => toggleGroup(item.group.alarmName)}
            bucketCfg={cfg}
            ref={ref}
            dataIndex={dataIndex}
          />
        )
      case 'groupEvent':
        return <EventRow key={item.event.id} event={item.event} indented ref={ref} dataIndex={dataIndex} {...rowProps} />
    }
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
                  renderFlatItem(flatItems[vRow.index]!, virtualizer.measureElement, vRow.index)
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
                {flatItems.map((item) => renderFlatItem(item))}
              </TableBody>
            </Table>
          </div>
        )
      )}
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────

const DEFAULT_WH: WorkingHours = { timezone: 'Europe/Rome', start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] }

export function AlarmEventGroupedView({
  workingHours, onCallHours, filters,
  visibleColumns, getWidth, totalMinWidth,
  canWrite, canDelete,
  selectedEventId, showDetailPanel, lingeringId,
  onRowClick, onEdit, onDelete, isOnCallEvent, onAlarmClick,
  onCreateAnalysis, onAssociateAnalysis, onUnlinkAnalysis,
}: AlarmEventGroupedViewProps) {
  const [referenceDate, setReferenceDate] = useState<string>(() => todayUTC())

  const wh     = workingHours ?? DEFAULT_WH
  const allDay = isOnCallAllDay(referenceDate, onCallHours)
  const { dateFrom, dateTo, splitAt, overnightStart, overnightEnd, workEnd } =
    buildShiftRange(referenceDate, wh, onCallHours, allDay)

  const queryParams = useMemo(() => ({
    page:     1,
    pageSize: 1000,
    dateFrom,
    dateTo,
    ...(filters.productId     && { productId:     filters.productId }),
    ...(filters.environmentId && { environmentId: filters.environmentId }),
    ...(filters.awsAccountId  && { awsAccountId:  filters.awsAccountId }),
    ...(filters.awsRegion     && { awsRegion:      filters.awsRegion }),
  }), [dateFrom, dateTo, filters.productId, filters.environmentId, filters.awsAccountId, filters.awsRegion])

  const isToday = referenceDate === todayUTC()

  const { data, isLoading, isFetching, refetch } = useQuery<PaginatedResponse<AlarmEvent>>({
    queryKey:             ['alarm-events-grouped', queryParams],
    queryFn:              () => api.getAlarmEvents(queryParams),
    refetchInterval:      isToday ? 30_000 : false,
    refetchOnWindowFocus: isToday,
  })

  const allEvents  = data?.data ?? []
  const totalCount = data?.pagination?.totalItems ?? null
  const tooMany    = totalCount !== null && totalCount > 1000

  const { oncall, work } = useMemo(
    () => partitionShiftEvents(allEvents, splitAt),
    [allEvents, splitAt],
  )

  const bucketProps = { visibleColumns, getWidth, totalMinWidth, canWrite, canDelete,
    selectedEventId, showDetailPanel, lingeringId, onRowClick, onEdit, onDelete, isOnCallEvent, onAlarmClick,
    onCreateAnalysis, onAssociateAnalysis, onUnlinkAnalysis }

  return (
    <div className="space-y-3">
      <OnCallNavigation
        referenceDate={referenceDate}
        onDateChange={setReferenceDate}
        isFetching={isFetching}
        onRefresh={() => refetch()}
        totalCount={isLoading ? null : totalCount}
        allDay={allDay}
        overnightStart={overnightStart}
        workEnd={workEnd}
      />

      {tooMany && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-300/60 bg-yellow-50/60 px-3 py-2 text-xs text-yellow-700 dark:border-yellow-800/30 dark:bg-yellow-950/20 dark:text-yellow-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Questo turno supera i 1000 eventi — sono mostrati solo i primi 1000.
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : allDay ? (
        <div className="space-y-3">
          <GroupedBucketSection cfg={ONCALL_BUCKETS.oncall} events={oncall} timeRange="00:00 – 23:59" {...bucketProps} />
        </div>
      ) : (
        <div className="space-y-3">
          <GroupedBucketSection cfg={ONCALL_BUCKETS.work} events={work} timeRange={`${overnightEnd} – ${workEnd}`} {...bucketProps} />
          <GroupedBucketSection cfg={ONCALL_BUCKETS.oncall} events={oncall} timeRange={`${overnightStart} – ${overnightEnd}`} {...bucketProps} />
        </div>
      )}
    </div>
  )
}
