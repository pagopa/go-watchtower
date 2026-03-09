'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertTriangle } from 'lucide-react'
import { api, type AlarmAnalysis, type PaginatedResponse } from '@/lib/api-client'
import type { ColumnDef } from '@/lib/column-registry'
import type { AnalysisFiltersState } from './analysis-filters'
import type { WorkingHours, OnCallHours } from '@go-watchtower/shared'
import {
  OnCallNavigation,
  ONCALL_BUCKETS,
  buildShiftRange,
  isOnCallAllDay,
} from '../../alarm-events/_components/alarm-event-oncall-view'
import { todayUTC } from '../../alarm-events/_components/alarm-event-daily-view'
import { AnalysisBucketSection, partitionShiftAnalyses } from './analysis-daily-view'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnalysisOnCallViewProps {
  workingHours:       WorkingHours | null
  onCallHours:        OnCallHours | null
  filters:            AnalysisFiltersState
  productId:          string
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
}

// ─── Main export ──────────────────────────────────────────────────────────────

const DEFAULT_WH: WorkingHours = { timezone: 'Europe/Rome', start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] }

export function AnalysisOnCallView({
  workingHours, onCallHours, filters, productId,
  visibleColumns, getWidth, totalMinWidth,
  canWrite, canDelete,
  selectedAnalysisId, showDetailPanel, lingeringId,
  onRowClick, onEdit, onDelete,
  canEditAnalysis, canDeleteAnalysis, isAnalysisLocked, lockDays,
  onValidationClick,
}: AnalysisOnCallViewProps) {
  const [referenceDate, setReferenceDate] = useState<string>(() => todayUTC())

  const wh     = workingHours ?? DEFAULT_WH
  const allDay = isOnCallAllDay(referenceDate, onCallHours)
  const { dateFrom, dateTo, splitAt, overnightStart, overnightEnd, workEnd } =
    buildShiftRange(referenceDate, wh, onCallHours, allDay)

  const queryParams = useMemo(() => ({
    page:      1,
    pageSize:  1000,
    sortBy:    'analysisDate' as const,
    sortOrder: 'asc' as const,
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
    ...(filters.microserviceId          && { microserviceId: filters.microserviceId }),
    ...(filters.downstreamId            && { downstreamId: filters.downstreamId }),
    ...(filters.traceId                 && { traceId: filters.traceId }),
  }), [
    dateFrom, dateTo, productId,
    filters.search, filters.analysisType, filters.status,
    filters.environmentId, filters.operatorId, filters.alarmId,
    filters.finalActionId, filters.isOnCall, filters.ignoreReasonCode,
    filters.runbookId, filters.microserviceId, filters.downstreamId, filters.traceId,
  ])

  const { data, isLoading, isFetching, refetch } = useQuery<PaginatedResponse<AlarmAnalysis>>({
    queryKey:             ['analyses-oncall', queryParams],
    queryFn:              () => api.getAllAnalyses(queryParams),
    refetchInterval:      30_000,
    refetchOnWindowFocus: true,
  })

  const allAnalyses = data?.data ?? []
  const totalCount  = data?.pagination?.totalItems ?? null
  const tooMany     = totalCount !== null && totalCount > 1000

  const { oncall, work } = useMemo(
    () => partitionShiftAnalyses(allAnalyses, splitAt),
    [allAnalyses, splitAt],
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
          Questo turno supera le 1000 analisi — sono mostrate solo le prime 1000.
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : allDay ? (
        <div className="space-y-3">
          <AnalysisBucketSection
            cfg={ONCALL_BUCKETS.oncall}
            analyses={oncall}
            timeRange="00:00 – 23:59"
            {...bucketProps}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <AnalysisBucketSection
            cfg={ONCALL_BUCKETS.work}
            analyses={work}
            timeRange={`${overnightEnd} – ${workEnd}`}
            {...bucketProps}
          />
          <AnalysisBucketSection
            cfg={ONCALL_BUCKETS.oncall}
            analyses={oncall}
            timeRange={`${overnightStart} – ${overnightEnd}`}
            {...bucketProps}
          />
        </div>
      )}
    </div>
  )
}
