'use client'

import { Suspense, useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Inbox, RefreshCw, ChevronDown,
  LayoutList, CalendarDays, PhoneCall, Layers,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  api,
  ApiClientError,
  type Product,
  type AlarmEvent,
  type Environment,
  type UserDetail,
  type AlarmAnalysis,
  type CreateAlarmAnalysisData,
  type PaginatedResponse,
  type CreateAlarmEventData,
  type UpdateAlarmEventData,
} from '@/lib/api-client'
import { AlarmDetailDialog, type AlarmDetailData } from '@/components/alarm-detail-dialog'
import { usePermissions } from '@/hooks/use-permissions'
import { usePreferences } from '@/hooks/use-preferences'
import { useCollapsiblePreference } from '@/hooks/use-collapsible-preference'
import { usePageSize, type AllowedPageSize } from '@/hooks/use-page-size'
import { useRowSelection } from '@/hooks/use-row-selection'
import { useColumnSettings } from '@/hooks/use-column-settings'
import { COLUMN_REGISTRY } from '@/lib/column-registry'
import { qk } from '@/lib/query-keys'
import { invalidate } from '@/lib/query-invalidation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableHead,
} from '@/components/ui/table'
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog'
import { DataTableHeader, PaginationControls, useTableMinWidth, useSort } from '@/components/data-table'
import { ColumnConfigurator } from '@/components/ui/column-configurator'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import dynamic from 'next/dynamic'
import { isWorkingHoursSetting, isOnCallHoursSetting } from '@go-watchtower/shared'
import { AlarmEventFilters, type AlarmEventFiltersState, type ProductWithEnvironments } from './_components/alarm-event-filters'
import { AlarmEventDetailPanel } from './_components/alarm-event-detail-panel'
import { AlarmEventDailyView, todayUTC } from './_components/alarm-event-daily-view'

const AlarmEventOnCallView = dynamic(
  () => import('./_components/alarm-event-oncall-view').then((m) => ({ default: m.AlarmEventOnCallView })),
  { ssr: false }
)

const AlarmEventGroupedView = dynamic(
  () => import('./_components/alarm-event-grouped-view').then((m) => ({ default: m.AlarmEventGroupedView })),
  { ssr: false }
)
import { AlarmEventTableRow } from './_components/alarm-event-table-row'

const AlarmEventFormDialog = dynamic(
  () => import('./_components/alarm-event-form-dialog').then((m) => ({ default: m.AlarmEventFormDialog })),
  { ssr: false }
)

const AssociateAnalysisDialog = dynamic(
  () => import('./_components/associate-analysis-dialog').then((m) => ({ default: m.AssociateAnalysisDialog })),
  { ssr: false }
)

const AnalysisFormDialog = dynamic(
  () => import('../analyses/_components/analysis-form-dialog').then((m) => ({ default: m.AnalysisFormDialog })),
  { ssr: false }
)

import { UnlinkAlarmEventDialog } from './_components/unlink-alarm-event-dialog'
import { BulkIgnoreDialog } from './_components/bulk-ignore-dialog'
import { SelectionToolbar } from './_components/selection-toolbar'
import type { AnalysisFormData } from '../analyses/_components/analysis-form-dialog'
import { isoToRomeLocal, isoToUTCLocal } from '../analyses/_components/analysis-form-schemas'

const DEFAULT_FILTERS: AlarmEventFiltersState = {
  environmentIds: [],
  awsAccountId: '',
  awsRegion:    '',
  dateFrom:     '',
  dateTo:       '',
}

const ALARM_EVENT_COLUMNS = COLUMN_REGISTRY.alarmEvents

export function AlarmEventsPageWrapper() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    }>
      <AlarmEventsPageContent />
    </Suspense>
  )
}

function AlarmEventsPageContent() {
  const queryClient = useQueryClient()
  const { can, isLoading: permissionsLoading } = usePermissions()
  const { preferences, updatePreferences } = usePreferences()

  // Filters — persisted in user preferences under savedFilters['alarmEvents'].
  // filtersOverride is null until the user changes filters in this session;
  // until then we derive from the server-side preferences (resolved synchronously
  // from TanStack Query cache on subsequent navigations).
  const FILTER_KEY = 'alarmEvents'
  const [filtersOverride, setFiltersOverride] = useState<AlarmEventFiltersState | null>(null)
  const filters: AlarmEventFiltersState = useMemo(() => {
    if (filtersOverride) return filtersOverride
    const saved = preferences.savedFilters?.[FILTER_KEY] as Record<string, unknown> | undefined
    if (!saved) return DEFAULT_FILTERS
    // Migrate legacy single environmentId → environmentIds array
    const envIds = Array.isArray(saved.environmentIds)
      ? saved.environmentIds as string[]
      : typeof saved.environmentId === 'string' && saved.environmentId
        ? [saved.environmentId as string]
        : []
    return {
      ...DEFAULT_FILTERS,
      ...saved,
      environmentIds: envIds,
    } as AlarmEventFiltersState
  }, [filtersOverride, preferences.savedFilters])

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Flush pending debounced save on unmount
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  }, [])

  const persistFilters = useCallback(
    (value: Record<string, unknown> | null) => {
      updatePreferences({
        savedFilters: { ...preferences.savedFilters, [FILTER_KEY]: value } as Record<string, Record<string, unknown>>,
      })
    },
    [updatePreferences, preferences.savedFilters],
  )

  // Pagination
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()

  // Sorting
  const { sortBy, sortOrder, handleSort } = useSort('firedAt')

  // UI state
  const [selectedEvent, setSelectedEvent] = useState<AlarmEvent | null>(null)
  const [showDetailPanel, setShowDetailPanel] = useState(false)
  const [lingeringId, setLingeringId] = useState<string | null>(null)
  const lingeringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (lingeringTimerRef.current) clearTimeout(lingeringTimerRef.current)
  }, [])

  const [formOpen, setFormOpen] = useState(false)
  const [editItem, setEditItem] = useState<AlarmEvent | null>(null)
  const [deleteItem, setDeleteItem] = useState<AlarmEvent | null>(null)

  // Alarm detail dialog
  const [alarmDialogOpen, setAlarmDialogOpen] = useState(false)
  const [alarmDialogData, setAlarmDialogData] = useState<AlarmDetailData | null>(null)

  // Analysis actions from alarm event
  const [analysisFormOpen, setAnalysisFormOpen] = useState(false)
  const [analysisInitialValues, setAnalysisInitialValues] = useState<Partial<AnalysisFormData> | undefined>(undefined)
  const [analysisProductId, setAnalysisProductId] = useState('')
  const [analysisSourceEventId, setAnalysisSourceEventId] = useState<string | null>(null)
  const [associateDialogOpen, setAssociateDialogOpen] = useState(false)
  const [associateEvent, setAssociateEvent] = useState<AlarmEvent | null>(null)
  const [unlinkEvent, setUnlinkEvent] = useState<AlarmEvent | null>(null)

  // Multi-select (shared across all view modes)
  const {
    selectedIds, selectedItems: selectedEvents, selectedCount,
    toggleOne, toggleBucket, isBucketAllSelected, isBucketIndeterminate,
    clearSelection,
  } = useRowSelection<AlarmEvent>()
  const [bulkIgnoreOpen, setBulkIgnoreOpen] = useState(false)

  // View mode — derived from user preferences when available, local override otherwise.
  // preferences.alarmEventViewMode resolves synchronously from cache on subsequent
  // navigations (staleTime=Infinity). The local override is set only when the user
  // explicitly changes the view mode; until then we follow the server preference.
  const [viewModeOverride, setViewModeOverride] = useState<'list' | 'daily' | 'oncall' | 'grouped' | null>(null)
  const viewMode = viewModeOverride ?? (preferences.alarmEventViewMode as 'list' | 'daily' | 'oncall' | 'grouped' | undefined) ?? 'list'

  const handleSetViewMode = useCallback((mode: 'list' | 'daily' | 'oncall' | 'grouped') => {
    setViewModeOverride(mode)
    updatePreferences({ alarmEventViewMode: mode })
    clearSelection()
  }, [updatePreferences, clearSelection])

  const selectionProps = useMemo(() => ({
    selectedIds, onToggleSelect: toggleOne, onToggleBucket: toggleBucket,
    isBucketAllSelected, isBucketIndeterminate,
  }), [selectedIds, toggleOne, toggleBucket, isBucketAllSelected, isBucketIndeterminate])
  const [selectedDate, setSelectedDate] = useState<string>(() => todayUTC())

  // Filters collapsed
  const { collapsed: filtersCollapsed, toggle: handleToggleFiltersCollapsed } = useCollapsiblePreference('alarmEventFiltersCollapsed')

  // Permissions
  const canWrite  = !permissionsLoading && can('ALARM_EVENT', 'write')
  const canDelete = !permissionsLoading && can('ALARM_EVENT', 'delete')
  const canWriteAnalysis = !permissionsLoading && can('ALARM_ANALYSIS', 'write')
  const hasRowActions = canWrite || canDelete || canWriteAnalysis

  // Column settings
  const {
    visibleColumns,
    allColumns,
    isVisible,
    toggleColumn,
    getWidth,
    setWidth,
    moveColumn,
    renameColumn,
    resetColumns,
  } = useColumnSettings('alarmEvents', ALARM_EVENT_COLUMNS)

  const totalTableMinWidth = useTableMinWidth(visibleColumns, getWidth, hasRowActions)

  // --- Queries ---

  const { data: products } = useQuery<Product[]>({
    queryKey: qk.products.list,
    queryFn: api.getProducts,
  })

  // Users — needed for the analysis form dialog
  const { data: users } = useQuery<UserDetail[]>({
    queryKey: qk.users.list,
    queryFn: api.getUsers,
    enabled: can('USER', 'read'),
  })

  // All environments across all products — used for multi-select filter + on-call pattern map.
  const activeProducts = useMemo(() => products?.filter((p) => p.isActive) ?? [], [products])
  const activeProductIds = useMemo(() => activeProducts.map((p) => p.id), [activeProducts])
  const { data: allEnvironments } = useQuery<Environment[]>({
    queryKey: qk.products.allEnvironments(activeProductIds),
    queryFn: async () => {
      if (!activeProductIds.length) return []
      const arrays = await Promise.all(activeProductIds.map((id) => api.getEnvironments(id)))
      return arrays.flat()
    },
    enabled: activeProductIds.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // Build product+environments groups for the multi-select filter
  const productEnvironments = useMemo<ProductWithEnvironments[]>(() => {
    if (!allEnvironments?.length || !activeProducts.length) return []
    const envsByProduct = new Map<string, Environment[]>()
    for (const env of allEnvironments) {
      const list = envsByProduct.get(env.productId) ?? []
      list.push(env)
      envsByProduct.set(env.productId, list)
    }
    return activeProducts
      .filter((p) => envsByProduct.has(p.id))
      .map((p) => ({ product: p, environments: envsByProduct.get(p.id)! }))
  }, [activeProducts, allEnvironments])

  // Map environmentId → compiled RegExp for on-call row highlighting
  const onCallRegexMap = useMemo(() => {
    if (!allEnvironments?.length) return new Map<string, RegExp>()
    const map = new Map<string, RegExp>()
    for (const e of allEnvironments) {
      if (e.onCallAlarmPattern) {
        try { map.set(e.id, new RegExp(e.onCallAlarmPattern)) } catch { /* invalid regex, skip */ }
      }
    }
    return map
  }, [allEnvironments])

  const queryParams = useMemo(() => ({
    page,
    pageSize,
    ...(filters.environmentIds.length > 0 && { environmentId: filters.environmentIds }),
    ...(filters.awsAccountId && { awsAccountId: filters.awsAccountId }),
    ...(filters.awsRegion    && { awsRegion:    filters.awsRegion }),
    ...(filters.dateFrom     && { dateFrom:     filters.dateFrom }),
    ...(filters.dateTo       && { dateTo:       filters.dateTo }),
  }), [
    page, pageSize,
    filters.environmentIds, filters.awsAccountId,
    filters.awsRegion, filters.dateFrom, filters.dateTo,
  ])

  const {
    data: eventsResponse,
    isLoading: eventsLoading,
    isFetching: eventsFetching,
    error: eventsError,
    refetch: refetchEvents,
    dataUpdatedAt: eventsUpdatedAt,
  } = useQuery<PaginatedResponse<AlarmEvent>>({
    queryKey: qk.alarmEvents.list(queryParams),
    queryFn: () => api.getAlarmEvents(queryParams),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  })

  const events     = eventsResponse?.data
  const pagination = eventsResponse?.pagination

  // Working hours — fetched with fallback so non-admin users still get defaults.
  // 403 is expected for non-admin users; other errors are logged.
  const { data: workingHours } = useQuery({
    queryKey: qk.settings.workingHours,
    queryFn:  async () => {
      try {
        const s = await api.getSetting('working_hours')
        if (isWorkingHoursSetting(s)) return s.value
      } catch (err) {
        if (!(err instanceof ApiClientError && err.status === 403)) {
          console.error('[alarm-events] Failed to fetch working_hours setting:', err)
        }
      }
      return null
    },
    staleTime: 5 * 60 * 1000,
  })

  // On-call hours — optional, shown only when configured.
  // 403 is expected for non-admin users; other errors are logged.
  const { data: onCallHours } = useQuery({
    queryKey: qk.settings.onCallHours,
    queryFn:  async () => {
      try {
        const s = await api.getSetting('on_call_hours')
        if (isOnCallHoursSetting(s)) return s.value
      } catch (err) {
        if (!(err instanceof ApiClientError && err.status === 403)) {
          console.error('[alarm-events] Failed to fetch on_call_hours setting:', err)
        }
      }
      return null
    },
    staleTime: 5 * 60 * 1000,
  })

  // --- Mutations ---

  const createMutation = useMutation({
    mutationFn: (data: CreateAlarmEventData) => api.createAlarmEvent(data),
    onSuccess: () => {
      invalidate(queryClient, 'alarmEvents')
      setPage(1)
      toast.success('Allarme scattato creato con successo')
      setEditItem(null)
      setFormOpen(false)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante la creazione')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAlarmEventData }) =>
      api.updateAlarmEvent(id, data),
    onSuccess: (updated) => {
      invalidate(queryClient, 'alarmEvents')
      toast.success('Allarme aggiornato con successo')
      setEditItem(null)
      setFormOpen(false)
      // Keep panel open with updated data
      setSelectedEvent(updated)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante l\'aggiornamento')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteAlarmEvent(id),
    onSuccess: () => {
      invalidate(queryClient, 'alarmEvents')
      toast.success('Allarme scattato eliminato con successo')
      setDeleteItem(null)
      setShowDetailPanel(false)
      setSelectedEvent(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante l\'eliminazione')
    },
  })

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  // --- Handlers ---

  const handleFilterChange = useCallback((newFilters: AlarmEventFiltersState) => {
    setFiltersOverride(newFilters)
    setPage(1)
    clearSelection()
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      persistFilters(newFilters as unknown as Record<string, unknown>)
    }, 1000)
  }, [clearSelection, persistFilters])

  const handleResetFilters = useCallback(() => {
    setFiltersOverride(DEFAULT_FILTERS)
    setPage(1)
    clearSelection()
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    persistFilters(null)
  }, [clearSelection, persistFilters])



  const handleRowClick = (event: AlarmEvent) => {
    if (selectedEvent?.id === event.id && showDetailPanel) {
      handleCloseDetailPanel()
      return
    }
    if (lingeringTimerRef.current) {
      clearTimeout(lingeringTimerRef.current)
      lingeringTimerRef.current = null
    }
    setLingeringId(null)
    setSelectedEvent(event)
    setShowDetailPanel(true)
  }

  const handleEdit = (event: AlarmEvent) => {
    setEditItem(event)
    setFormOpen(true)
  }

  const handleDelete = (event: AlarmEvent) => {
    setDeleteItem(event)
  }

  const handleCloseDetailPanel = () => {
    if (lingeringTimerRef.current) clearTimeout(lingeringTimerRef.current)
    const closingId = selectedEvent?.id ?? null
    setShowDetailPanel(false)
    if (closingId) {
      setLingeringId(closingId)
      lingeringTimerRef.current = setTimeout(() => {
        setLingeringId(null)
        setSelectedEvent(null)
        lingeringTimerRef.current = null
      }, 900)
    } else {
      setSelectedEvent(null)
    }
  }

  const handleFormSubmit = async (data: CreateAlarmEventData | UpdateAlarmEventData, id?: string) => {
    if (id) {
      await updateMutation.mutateAsync({ id, data: data as UpdateAlarmEventData })
    } else {
      await createMutation.mutateAsync(data as CreateAlarmEventData)
    }
  }

  const handleAlarmClick = useCallback((alarm: NonNullable<AlarmEvent['alarm']>, productId: string) => {
    setAlarmDialogData({
      id:          alarm.id,
      name:        alarm.name,
      description: alarm.description,
      productId,
      runbook:     alarm.runbook ?? null,
    })
    setAlarmDialogOpen(true)
  }, [])

  const isOnCallEvent = useCallback((event: AlarmEvent): boolean => {
    const regex = onCallRegexMap.get(event.environment.id)
    if (!regex) return false
    return regex.test(event.name)
  }, [onCallRegexMap])

  // --- Analysis actions from alarm event ---

  const handleCreateAnalysisFromEvent = useCallback((event: AlarmEvent) => {
    setShowDetailPanel(false)
    setAnalysisProductId(event.product.id)
    setAnalysisSourceEventId(event.id)
    setAnalysisInitialValues({
      analysisDate: isoToRomeLocal(new Date().toISOString()),
      firstAlarmAt: isoToUTCLocal(event.firedAt),
      lastAlarmAt:  isoToUTCLocal(event.firedAt),
      alarmId:      event.alarmId ?? '',
      environmentId: event.environment.id,
      occurrences:  1,
    })
    setAnalysisFormOpen(true)
  }, [])

  const handleCreateIgnorableAnalysisFromEvent = useCallback((event: AlarmEvent) => {
    setShowDetailPanel(false)
    setAnalysisProductId(event.product.id)
    setAnalysisSourceEventId(event.id)
    setAnalysisInitialValues({
      analysisDate: isoToRomeLocal(new Date().toISOString()),
      firstAlarmAt: isoToUTCLocal(event.firedAt),
      lastAlarmAt:  isoToUTCLocal(event.firedAt),
      alarmId:      event.alarmId ?? '',
      environmentId: event.environment.id,
      occurrences:  1,
      analysisType: 'IGNORABLE' as const,
    })
    setAnalysisFormOpen(true)
  }, [])

  const handleAssociateAnalysis = useCallback((event: AlarmEvent) => {
    setShowDetailPanel(false)
    setAssociateEvent(event)
    setAssociateDialogOpen(true)
  }, [])

  const handleUnlinkAnalysis = useCallback((event: AlarmEvent) => {
    setShowDetailPanel(false)
    setUnlinkEvent(event)
  }, [])

  const createAnalysisMutation = useMutation({
    mutationFn: async (formData: AnalysisFormData) => {
      const data: CreateAlarmAnalysisData = {
        ...formData,
        occurrences: typeof formData.occurrences === 'number' ? formData.occurrences : undefined,
        analysisType: formData.analysisType as CreateAlarmAnalysisData['analysisType'],
        status: formData.status as CreateAlarmAnalysisData['status'],
      }
      const analysis = await api.createAnalysis(analysisProductId, data)
      // Link the alarm event to the new analysis
      if (analysisSourceEventId) {
        await api.linkAlarmEventAnalysis(analysisSourceEventId, analysis.id)
      }
      return analysis
    },
    onSuccess: () => {
      invalidate(queryClient, 'alarmEvents', 'analyses')
      toast.success('Analisi creata e evento associato')
      setAnalysisFormOpen(false)
      setAnalysisSourceEventId(null)
      setAnalysisInitialValues(undefined)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante la creazione dell\'analisi')
    },
  })

  // --- Main Render ---

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-baseline gap-3 pb-1">
        <h1 className="text-xl font-semibold tracking-tight">Allarmi Scattati</h1>
        <span className="text-xs text-muted-foreground">tutti i prodotti</span>
      </div>

      {/* Filters */}
      <AlarmEventFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onReset={handleResetFilters}
        productEnvironments={productEnvironments}
        collapsed={filtersCollapsed}
        onToggleCollapsed={handleToggleFiltersCollapsed}
      />

      {/* Results Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {viewMode === 'list' && pagination && (
            <p>
              <span className="font-medium tabular-nums text-foreground">{pagination.totalItems}</span>
              {' '}allarmi trovati
            </p>
          )}
          {eventsUpdatedAt > 0 && (
            <span className="text-xs text-muted-foreground/60">
              agg. {new Date(eventsUpdatedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => refetchEvents()}
            disabled={eventsFetching}
            title="Aggiorna dati"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${eventsFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                {viewMode === 'list' && <LayoutList className="h-4 w-4" />}
                {viewMode === 'daily' && <CalendarDays className="h-4 w-4" />}
                {viewMode === 'grouped' && <Layers className="h-4 w-4" />}
                {viewMode === 'oncall' && <PhoneCall className="h-4 w-4" />}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem className={viewMode === 'list' ? 'bg-accent' : ''} onClick={() => handleSetViewMode('list')}>
                <LayoutList className="mr-2 h-4 w-4" /> Lista
              </DropdownMenuItem>
              <DropdownMenuItem className={viewMode === 'daily' ? 'bg-accent' : ''} onClick={() => handleSetViewMode('daily')}>
                <CalendarDays className="mr-2 h-4 w-4" /> Giornaliero
              </DropdownMenuItem>
              <DropdownMenuItem className={viewMode === 'grouped' ? 'bg-accent' : ''} onClick={() => handleSetViewMode('grouped')}>
                <Layers className="mr-2 h-4 w-4" /> Raggruppato
              </DropdownMenuItem>
              <DropdownMenuItem className={viewMode === 'oncall' ? 'bg-accent' : ''} onClick={() => handleSetViewMode('oncall')}>
                <PhoneCall className="mr-2 h-4 w-4" /> Reperibilità
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ColumnConfigurator
            allColumns={allColumns}
            isVisible={isVisible}
            toggleColumn={toggleColumn}
            moveColumn={moveColumn}
            renameColumn={renameColumn}
            resetColumns={resetColumns}
          />
          {canWrite && (
            <Button size="sm" onClick={() => { setEditItem(null); setFormOpen(true) }}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Nuovo allarme
            </Button>
          )}
        </div>
      </div>

      {/* Daily view */}
      {viewMode === 'daily' && (
        <AlarmEventDailyView
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          workingHours={workingHours ?? null}
          filters={filters}
          visibleColumns={visibleColumns}
          getWidth={getWidth}
          totalMinWidth={totalTableMinWidth}
          canWrite={canWrite}
          canDelete={canDelete}
          canWriteAnalysis={canWriteAnalysis}
          selectedEventId={selectedEvent?.id ?? null}
          showDetailPanel={showDetailPanel}
          lingeringId={lingeringId}
          onRowClick={handleRowClick}
          onEdit={handleEdit}
          onDelete={handleDelete}
          isOnCallEvent={isOnCallEvent}
          onAlarmClick={handleAlarmClick}
          onCreateAnalysis={handleCreateAnalysisFromEvent}
          onCreateIgnorableAnalysis={handleCreateIgnorableAnalysisFromEvent}
          onAssociateAnalysis={handleAssociateAnalysis}
          onUnlinkAnalysis={handleUnlinkAnalysis}
          selection={selectionProps}
        />
      )}

      {/* On-call view */}
      {viewMode === 'oncall' && (
        <AlarmEventOnCallView
          workingHours={workingHours ?? null}
          onCallHours={onCallHours ?? null}
          filters={filters}
          visibleColumns={visibleColumns}
          getWidth={getWidth}
          totalMinWidth={totalTableMinWidth}
          canWrite={canWrite}
          canDelete={canDelete}
          canWriteAnalysis={canWriteAnalysis}
          selectedEventId={selectedEvent?.id ?? null}
          showDetailPanel={showDetailPanel}
          lingeringId={lingeringId}
          onRowClick={handleRowClick}
          onEdit={handleEdit}
          onDelete={handleDelete}
          isOnCallEvent={isOnCallEvent}
          onAlarmClick={handleAlarmClick}
          onCreateAnalysis={handleCreateAnalysisFromEvent}
          onCreateIgnorableAnalysis={handleCreateIgnorableAnalysisFromEvent}
          onAssociateAnalysis={handleAssociateAnalysis}
          onUnlinkAnalysis={handleUnlinkAnalysis}
          selection={selectionProps}
        />
      )}

      {/* Grouped view */}
      {viewMode === 'grouped' && (
        <AlarmEventGroupedView
          workingHours={workingHours ?? null}
          onCallHours={onCallHours ?? null}
          filters={filters}
          visibleColumns={visibleColumns}
          getWidth={getWidth}
          totalMinWidth={totalTableMinWidth}
          canWrite={canWrite}
          canDelete={canDelete}
          canWriteAnalysis={canWriteAnalysis}
          selectedEventId={selectedEvent?.id ?? null}
          showDetailPanel={showDetailPanel}
          lingeringId={lingeringId}
          onRowClick={handleRowClick}
          onEdit={handleEdit}
          onDelete={handleDelete}
          isOnCallEvent={isOnCallEvent}
          onAlarmClick={handleAlarmClick}
          onCreateAnalysis={handleCreateAnalysisFromEvent}
          onCreateIgnorableAnalysis={handleCreateIgnorableAnalysisFromEvent}
          onAssociateAnalysis={handleAssociateAnalysis}
          onUnlinkAnalysis={handleUnlinkAnalysis}
          selection={selectionProps}
        />
      )}

      {/* Table (list view) */}
      {viewMode === 'list' && <Card className="overflow-hidden">
        <CardContent className="p-0">
          {eventsLoading ? (
            <div className="divide-y">
              <div className="flex items-center gap-4 bg-muted/30 px-4 py-2.5">
                {Array.from([24, 20, 14, 14, 16].entries()).map(([n, w]) => (
                  <Skeleton key={n} className={`h-3 w-${w} rounded`} />
                ))}
              </div>
              {Array.from({ length: 8 }, (_, n) => n).map(n => (
                <div key={n} className="flex items-center gap-4 px-4 py-3" style={{ animationDelay: `${n * 40}ms` }}>
                  <Skeleton className="h-3.5 w-32 rounded" />
                  <Skeleton className="h-3.5 w-44 rounded" />
                  <Skeleton className="h-5 w-20 rounded" />
                  <Skeleton className="h-3.5 w-20 rounded" />
                  <Skeleton className="h-3.5 w-24 rounded" />
                </div>
              ))}
            </div>
          ) : eventsError && !events ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-sm text-destructive">Errore durante il caricamento degli allarmi.</p>
              {eventsError instanceof Error && eventsError.message && (
                <p className="text-xs text-muted-foreground">{eventsError.message}</p>
              )}
            </div>
          ) : events && events.length > 0 ? (
            <>
              <Table
                className="w-full"
                style={{ tableLayout: 'fixed', minWidth: `${totalTableMinWidth}px` }}
              >
                <DataTableHeader
                  columns={visibleColumns}
                  getWidth={getWidth}
                  setWidth={setWidth}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                  hasActions={hasRowActions}
                  prependContent={
                    <TableHead className="w-10 px-2">
                      <input
                        type="checkbox"
                        aria-label="Seleziona tutti gli allarmi"
                        className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                        checked={events ? isBucketAllSelected(events) : false}
                        ref={(el) => { if (el) el.indeterminate = events ? isBucketIndeterminate(events) : false }}
                        onChange={() => events && toggleBucket(events)}
                      />
                    </TableHead>
                  }
                />
                <TableBody>
                  {events.map((event) => (
                    <AlarmEventTableRow
                      key={event.id}
                      event={event}
                      isChecked={selectedIds.has(event.id)}
                      isDetailSelected={event.id === selectedEvent?.id && showDetailPanel}
                      isLingering={event.id === lingeringId && !showDetailPanel}
                      isOnCall={isOnCallEvent(event)}
                      visibleColumns={visibleColumns}
                      getWidth={getWidth}
                      canWrite={canWrite}
                      canDelete={canDelete}
                      canWriteAnalysis={canWriteAnalysis}
                      onRowClick={handleRowClick}
                      onToggleSelect={toggleOne}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onAlarmClick={handleAlarmClick}
                      onCreateAnalysis={handleCreateAnalysisFromEvent}
                      onCreateIgnorableAnalysis={handleCreateIgnorableAnalysisFromEvent}
                      onAssociateAnalysis={handleAssociateAnalysis}
                      onUnlinkAnalysis={handleUnlinkAnalysis}
                    />
                  ))}
                </TableBody>
              </Table>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="rounded-2xl bg-muted/60 p-4">
                <Inbox className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Nessun allarme scattato trovato</p>
                <p className="text-xs text-muted-foreground">Prova a modificare i filtri o registra un nuovo allarme.</p>
              </div>
              {canWrite && (
                <Button size="sm" variant="outline" onClick={() => { setEditItem(null); setFormOpen(true) }}>
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Nuovo allarme
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>}

      {/* Pagination (list view only) */}
      {viewMode === 'list' && pagination && (
        <PaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          pageSize={pageSize}
          onPageChange={(p) => { setPage(p); clearSelection() }}
          onPageSizeChange={(size) => { setPageSize(size as AllowedPageSize); setPage(1); clearSelection() }}
        />
      )}

      {/* Alarm detail dialog */}
      <AlarmDetailDialog
        open={alarmDialogOpen}
        onClose={() => setAlarmDialogOpen(false)}
        alarm={alarmDialogData}
      />

      {/* Detail Side Panel */}
      <AlarmEventDetailPanel
        event={selectedEvent}
        open={showDetailPanel}
        onClose={handleCloseDetailPanel}
        onEdit={handleEdit}
        onDelete={handleDelete}
        canWrite={canWrite}
        canDelete={canDelete}
        isOnCall={selectedEvent ? isOnCallEvent(selectedEvent) : false}
        onAlarmClick={handleAlarmClick}
      />

      {/* Create/Edit Form Dialog */}
      <AlarmEventFormDialog
        open={formOpen}
        editEvent={editItem}
        onClose={() => { setFormOpen(false); setEditItem(null) }}
        onSubmit={handleFormSubmit}
        isSubmitting={isSubmitting}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={!!deleteItem}
        onOpenChange={() => setDeleteItem(null)}
        description={`Sei sicuro di voler eliminare l'allarme "${deleteItem?.name}"? Questa azione non può essere annullata.`}
        onConfirm={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
        isPending={deleteMutation.isPending}
      />

      {/* Create Analysis from Alarm Event */}
      <AnalysisFormDialog
        open={analysisFormOpen}
        onOpenChange={(open) => {
          setAnalysisFormOpen(open)
          if (!open) {
            setAnalysisSourceEventId(null)
            setAnalysisInitialValues(undefined)
          }
        }}
        editItem={null}
        onSubmit={(data) => createAnalysisMutation.mutate(data)}
        isPending={createAnalysisMutation.isPending}
        users={users}
        products={products}
        selectedProductId={analysisProductId}
        onProductChange={setAnalysisProductId}
        initialValues={analysisInitialValues}
      />

      {/* Associate Alarm Event to Existing Analysis */}
      <AssociateAnalysisDialog
        open={associateDialogOpen}
        onOpenChange={setAssociateDialogOpen}
        event={associateEvent}
        onAssociated={() => {
          invalidate(queryClient, 'alarmEvents')
        }}
      />

      {/* Unlink Alarm Event from Analysis */}
      <UnlinkAlarmEventFromRow
        unlinkEvent={unlinkEvent}
        onClose={() => setUnlinkEvent(null)}
      />

      {/* Bulk Ignore Dialog */}
      <BulkIgnoreDialog
        open={bulkIgnoreOpen}
        onOpenChange={setBulkIgnoreOpen}
        selectedEvents={selectedEvents}
        onCompleted={clearSelection}
      />

      {/* Floating selection toolbar */}
      <SelectionToolbar
        selectedCount={selectedCount}
        onBulkIgnore={() => setBulkIgnoreOpen(true)}
        onClearSelection={clearSelection}
        canWriteAnalysis={canWriteAnalysis}
      />
    </div>
  )
}

/** Fetches the linked analysis and renders the UnlinkAlarmEventDialog. */
function UnlinkAlarmEventFromRow({ unlinkEvent, onClose }: {
  unlinkEvent: AlarmEvent | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const productId = unlinkEvent?.product.id ?? ''
  const analysisId = unlinkEvent?.analysisId ?? ''

  const { data: analysis } = useQuery<AlarmAnalysis>({
    queryKey: qk.analyses.detail(productId, analysisId),
    queryFn: () => api.getAnalysis(productId, analysisId),
    enabled: !!unlinkEvent && !!analysisId,
    staleTime: 30_000,
  })

  return (
    <UnlinkAlarmEventDialog
      open={!!unlinkEvent}
      onOpenChange={(open) => { if (!open) onClose() }}
      eventId={unlinkEvent?.id ?? null}
      eventName={unlinkEvent?.name ?? ''}
      analysis={analysis ?? null}
      onCompleted={() => {
        invalidate(queryClient, 'alarmEvents', 'analyses')
        onClose()
      }}
    />
  )
}
