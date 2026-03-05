'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight,
  PhoneCall, Sun,
  Loader2, RefreshCw, AlertTriangle,
} from 'lucide-react'
import { api, type AlarmEvent, type PaginatedResponse } from '@/lib/api-client'
import type { ColumnDef } from '@/lib/column-registry'
import type { AlarmEventFiltersState } from './alarm-event-filters'
import { Button } from '@/components/ui/button'
import type { WorkingHours, OnCallHours } from '@go-watchtower/shared'
import type { BucketCfg } from './alarm-event-daily-view'
import { BucketSection, shiftDay, todayUTC, formatDateLong } from './alarm-event-daily-view'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AlarmEventOnCallViewProps {
  workingHours:    WorkingHours | null
  onCallHours:     OnCallHours | null
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
}

// ─── Bucket configs ───────────────────────────────────────────────────────────

const ONCALL_BUCKETS: Record<'oncall' | 'work', BucketCfg> = {
  oncall: {
    Icon:      PhoneCall,
    label:     'Reperibilità',
    headerCls: 'bg-rose-50/70 dark:bg-rose-950/20',
    textCls:   'text-rose-600 dark:text-rose-400',
    borderCls: 'border-rose-200/60 dark:border-rose-900/20',
    countCls:  'bg-rose-200/50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  },
  work: {
    Icon:      Sun,
    label:     'Orario lavorativo',
    headerCls: 'bg-amber-50 dark:bg-amber-950/20',
    textCls:   'text-amber-700 dark:text-amber-400',
    borderCls: 'border-amber-200/80 dark:border-amber-900/30',
    countCls:  'bg-amber-200/60 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  },
}

const DEFAULT_WH: WorkingHours = { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] }

// ─── Utilities ────────────────────────────────────────────────────────────────

/** ISO weekday (1=Mon … 7=Sun) from a YYYY-MM-DD string, using UTC noon. */
function isoWeekdayOfDate(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!, 12))
  const jsDay = date.getUTCDay()
  return jsDay === 0 ? 7 : jsDay
}

/**
 * Returns true if `dateStr` is a full-oncall (weekend) day.
 * Uses allDay.startDay/endDay if configured; falls back to Sat (6) / Sun (7).
 * The endDay itself is NOT "full day" (it terminates at endTime via overnight).
 */
function isOnCallAllDay(dateStr: string, oc: OnCallHours | null): boolean {
  const isoDay = isoWeekdayOfDate(dateStr)

  if (oc?.allDay) {
    const { startDay, endDay } = oc.allDay
    if (startDay <= endDay) {
      // Non-wrapping range (e.g. 6–7): include start up to but not including end
      return isoDay >= startDay && isoDay < endDay
    }
    // Wrapping range (e.g. startDay=6, endDay=1): Sat, Sun — but NOT Mon
    return isoDay >= startDay || isoDay < endDay
  }

  return isoDay === 6 || isoDay === 7
}

interface ShiftRange {
  dateFrom:       string
  dateTo:         string
  splitAt:        string | null
  overnightStart: string
  overnightEnd:   string
  workEnd:        string
}

function buildShiftRange(
  referenceDate: string,
  wh: WorkingHours,
  oc: OnCallHours | null,
  allDay: boolean,
): ShiftRange {
  const overnightStart = oc?.overnight?.start ?? '18:00'
  const overnightEnd   = oc?.overnight?.end   ?? '09:00'
  const workEnd        = wh.end

  if (allDay) {
    return {
      dateFrom:       `${referenceDate}T00:00:00.000Z`,
      dateTo:         `${referenceDate}T23:59:59.999Z`,
      splitAt:        null,
      overnightStart,
      overnightEnd,
      workEnd,
    }
  }

  const prevDate = shiftDay(referenceDate, -1)
  return {
    dateFrom:       `${prevDate}T${overnightStart}:00.000Z`,
    dateTo:         `${referenceDate}T${workEnd}:00.000Z`,
    splitAt:        `${referenceDate}T${overnightEnd}:00.000Z`,
    overnightStart,
    overnightEnd,
    workEnd,
  }
}

function partitionShiftEvents(
  events: AlarmEvent[],
  splitAt: string | null,
): { oncall: AlarmEvent[]; work: AlarmEvent[] } {
  if (splitAt === null) return { oncall: events, work: [] }
  const splitMs = new Date(splitAt).getTime()
  const oncall: AlarmEvent[] = []
  const work:   AlarmEvent[] = []
  for (const e of events) {
    if (new Date(e.firedAt).getTime() < splitMs) oncall.push(e)
    else work.push(e)
  }
  return { oncall, work }
}

function shortWeekday(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!, 12))
  const s = date.toLocaleDateString('it-IT', { weekday: 'short', timeZone: 'UTC' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─── Navigation header ────────────────────────────────────────────────────────

function OnCallNavigation({
  referenceDate, onDateChange, isFetching, onRefresh,
  totalCount, allDay, overnightStart, workEnd,
}: {
  referenceDate:  string
  onDateChange:   (d: string) => void
  isFetching:     boolean
  onRefresh:      () => void
  totalCount:     number | null
  allDay:         boolean
  overnightStart: string
  workEnd:        string
}) {
  const today   = todayUTC()
  const isToday = referenceDate === today
  const prevDate = shiftDay(referenceDate, -1)

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => onDateChange(shiftDay(referenceDate, -1))}
        disabled={isFetching}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Prec.
      </Button>

      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold">{formatDateLong(referenceDate)}</span>
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
        {allDay ? (
          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-600 dark:bg-rose-900/40 dark:text-rose-400">
            Reperibilità
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/60">
            {shortWeekday(prevDate)} {overnightStart} → {shortWeekday(referenceDate)} {workEnd}
          </span>
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => onDateChange(shiftDay(referenceDate, 1))}
        disabled={isFetching || isToday}
      >
        Succ.
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function AlarmEventOnCallView({
  workingHours, onCallHours, filters,
  visibleColumns, getWidth, totalMinWidth,
  canWrite, canDelete,
  selectedEventId, showDetailPanel, lingeringId,
  onRowClick, onEdit, onDelete, isOnCallEvent,
}: AlarmEventOnCallViewProps) {
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

  const { data, isLoading, isFetching, refetch } = useQuery<PaginatedResponse<AlarmEvent>>({
    queryKey:             ['alarm-events-oncall', queryParams],
    queryFn:              () => api.getAlarmEvents(queryParams),
    refetchInterval:      30_000,
    refetchOnWindowFocus: true,
  })

  const allEvents  = data?.data ?? []
  const totalCount = data?.pagination?.totalItems ?? null
  const tooMany    = totalCount !== null && totalCount > 1000

  const { oncall, work } = useMemo(
    () => partitionShiftEvents(allEvents, splitAt),
    [allEvents, splitAt],
  )

  const bucketProps = { visibleColumns, getWidth, totalMinWidth, canWrite, canDelete,
    selectedEventId, showDetailPanel, lingeringId, onRowClick, onEdit, onDelete, isOnCallEvent }

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
          <BucketSection
            cfg={ONCALL_BUCKETS.oncall}
            events={oncall}
            timeRange="00:00 – 23:59"
            {...bucketProps}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <BucketSection
            cfg={ONCALL_BUCKETS.work}
            events={work}
            timeRange={`${overnightEnd} – ${workEnd}`}
            {...bucketProps}
          />
          <BucketSection
            cfg={ONCALL_BUCKETS.oncall}
            events={oncall}
            timeRange={`${overnightStart} – ${overnightEnd}`}
            {...bucketProps}
          />
        </div>
      )}
    </div>
  )
}
