'use client'

import { Suspense, useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Inbox, RefreshCw, ChevronDown,
  LayoutList, CalendarDays, PhoneCall,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  api,
  type Product,
  type AlarmAnalysis,
  type AnalysisAuthor,
  type UserDetail,
  type PaginatedResponse,
  type AnalysisType,
  type AnalysisStatus,
  type CreateAlarmAnalysisData,
  type UpdateAlarmAnalysisData,
  type IgnoreReason,
  type ProductFilterOptions,
  type AlertPriorityLevel,
} from '@/lib/api-client'
import { usePermissions } from '@/hooks/use-permissions'
import { useCollapsiblePreference } from '@/hooks/use-collapsible-preference'
import { usePreferences } from '@/hooks/use-preferences'
import { usePageSize, type AllowedPageSize } from '@/hooks/use-page-size'
import { useColumnSettings } from '@/hooks/use-column-settings'
import { COLUMN_REGISTRY } from '@/lib/column-registry'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
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
import { qk } from '@/lib/query-keys'
import { invalidate } from '@/lib/query-invalidation'
import { validateAnalysis, assessQuality, type ValidationResult, type QualityResult } from '@/lib/analysis-validation'
import { ValidationDetailPanel } from '@/components/analysis/validation-detail-panel'
import { isWorkingHoursSetting, isOnCallHoursSetting } from '@go-watchtower/shared'
import { AnalysisFilters, type AnalysisFiltersState } from './_components/analysis-filters'
import type { AnalysisFormData } from './_components/analysis-form-dialog'
import { AnalysisDetailPanel } from './_components/analysis-detail-panel'
import { CreateAnalysisDropdown, type ShortcutType } from './_components/create-analysis-dropdown'
import { AnalysisTableRow } from './_components/analysis-table-row'
import { todayUTC } from '../alarm-events/_components/alarm-event-daily-view'

const AnalysisFormDialog = dynamic(
  () => import('./_components/analysis-form-dialog').then((m) => ({ default: m.AnalysisFormDialog })),
  { ssr: false }
)

const ShortcutInCorsoDialog = dynamic(
  () => import('./_components/shortcut-in-corso-dialog').then((m) => ({ default: m.ShortcutInCorsoDialog })),
  { ssr: false }
)

const ShortcutIgnorableDialog = dynamic(
  () => import('./_components/shortcut-ignorable-dialog').then((m) => ({ default: m.ShortcutIgnorableDialog })),
  { ssr: false }
)

const AnalysisDailyView = dynamic(
  () => import('./_components/analysis-daily-view').then((m) => ({ default: m.AnalysisDailyView })),
  { ssr: false }
)

const AnalysisOnCallView = dynamic(
  () => import('./_components/analysis-oncall-view').then((m) => ({ default: m.AnalysisOnCallView })),
  { ssr: false }
)

import { formatDate } from './_lib/constants'

const DEFAULT_FILTERS: AnalysisFiltersState = {
  search: '',
  analysisTypes: [],
  statuses: [],
  environmentIds: [],
  operatorIds: [],
  alarmIds: [],
  finalActionIds: [],
  priorityCodes: [],
  isOnCall: undefined,
  dateFrom: '',
  dateTo: '',
  ignoreReasonCodes: [],
  runbookIds: [],
  resourceIds: [],
  downstreamIds: [],
  traceId: '',
}

// --- Column Definitions (from shared registry) ---
const ANALYSIS_COLUMNS = COLUMN_REGISTRY.analyses

// --- Main Page Component ---

export function AnalysesPageWrapper() {
  return (
    <Suspense fallback={<div className="space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-64 w-full" /></div>}>
      <AnalysesPageContent />
    </Suspense>
  )
}

function AnalysesPageContent() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const { can, canFor, getScope, isLoading: permissionsLoading } = usePermissions()

  const searchParams = useSearchParams()

  // Product / analysis from URL search params (optional)
  const productIdFromUrl = searchParams.get('productId') || ''
  const analysisIdFromUrl = searchParams.get('analysisId') || ''

  // For the form dialog, we need a selectedProductId when creating from the "all" view
  const [formProductId, setFormProductId] = useState<string>('')

  // The effective productId for data queries (from URL or form selection)
  const effectiveProductId = productIdFromUrl

  // Filters — per-product, persisted in user preferences (synchronous derivation)
  const { preferences, updatePreferences } = usePreferences()

  const filterKey = `analyses:${effectiveProductId || '__all__'}`
  const filterKeyRef = useRef(filterKey)
  const savedFiltersRef = useRef(preferences.savedFilters)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Local overrides for the current session (keyed by filterKey).
  // Takes priority over saved preferences; debounced save writes through.
  const [filterOverrides, setFilterOverrides] = useState<Record<string, AnalysisFiltersState>>({})
  const filterOverridesRef = useRef(filterOverrides)

  useEffect(() => {
    filterKeyRef.current = filterKey
    savedFiltersRef.current = preferences.savedFilters
    filterOverridesRef.current = filterOverrides
  })

  // Derive filters synchronously — no useEffect/startTransition delay.
  // On product switch filterKey changes → useMemo re-evaluates immediately.
  const filters: AnalysisFiltersState = useMemo(() => {
    const override = filterOverrides[filterKey]
    if (override) return override
    const saved = preferences.savedFilters?.[filterKey]
    if (saved && typeof saved === 'object') {
      return { ...DEFAULT_FILTERS, ...saved } as AnalysisFiltersState
    }
    return DEFAULT_FILTERS
  }, [filterKey, filterOverrides, preferences.savedFilters])

  // Helper: persist a single product's filters while keeping all other entries.
  const persistFilters = useCallback(
    (key: string, value: Record<string, unknown> | null) => {
      updatePreferences({
        savedFilters: { ...savedFiltersRef.current, [key]: value } as Record<string, Record<string, unknown>>,
      })
    },
    [updatePreferences],
  )
  const persistFiltersRef = useRef(persistFilters)
  useEffect(() => { persistFiltersRef.current = persistFilters })

  // Pagination
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()

  // Reset page when product changes (render-time state adjustment).
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey)
    setPage(1)
  }

  // Flush pending debounced save when product changes (side-effect: ref + timer)
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [filterKey])

  // Flush pending filter save on unmount
  useEffect(() => () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
      const pending = filterOverridesRef.current[filterKeyRef.current]
      if (pending) {
        persistFiltersRef.current(filterKeyRef.current, pending as unknown as Record<string, unknown>)
      }
    }
  }, [])

  // View mode — derived from user preferences when available, local override otherwise.
  const [viewModeOverride, setViewModeOverride] = useState<'list' | 'daily' | 'oncall' | null>(null)
  const viewMode = viewModeOverride ?? (preferences.analysisViewMode as 'list' | 'daily' | 'oncall' | undefined) ?? 'list'

  const handleSetViewMode = useCallback((mode: 'list' | 'daily' | 'oncall') => {
    setViewModeOverride(mode)
    updatePreferences({ analysisViewMode: mode })
  }, [updatePreferences])

  const [selectedDate, setSelectedDate] = useState<string>(() => todayUTC())

  // Sorting
  const { sortBy, sortOrder, handleSort } = useSort('analysisDate')

  // UI state
  const [selectedAnalysis, setSelectedAnalysis] = useState<AlarmAnalysis | null>(null)
  const [showDetailPanel, setShowDetailPanel] = useState(false)
  const [lingeringId, setLingeringId] = useState<string | null>(null)
  const lingeringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (lingeringTimerRef.current) clearTimeout(lingeringTimerRef.current)
  }, [])

  const [activeShortcut, setActiveShortcut] = useState<ShortcutType | null>(null)
  const [editItem, setEditItem] = useState<AlarmAnalysis | null>(null)
  const [deleteItem, setDeleteItem] = useState<AlarmAnalysis | null>(null)
  const [validationPanelAnalysis, setValidationPanelAnalysis] = useState<AlarmAnalysis | null>(null)

  // Auto-open detail panel when navigating from an external link (e.g. from the event log)
  // Fetches the specific analysis by ID and opens the detail panel once.
  const [autoOpenedAnalysisId, setAutoOpenedAnalysisId] = useState<string | null>(null)
  const { data: linkedAnalysis } = useQuery<AlarmAnalysis>({
    queryKey: qk.analyses.detail(effectiveProductId, analysisIdFromUrl),
    queryFn: () => api.getAnalysis(effectiveProductId, analysisIdFromUrl),
    enabled: !!analysisIdFromUrl && !!effectiveProductId,
    retry: false,
    staleTime: 30_000,
  })
  // Render-time state adjustment: open detail panel once when linked analysis arrives
  if (linkedAnalysis && autoOpenedAnalysisId !== linkedAnalysis.id) {
    setAutoOpenedAnalysisId(linkedAnalysis.id)
    setSelectedAnalysis(linkedAnalysis)
    setShowDetailPanel(true)
  }

  const { collapsed: filtersCollapsed, toggle: handleToggleFiltersCollapsed } = useCollapsiblePreference('analysisFiltersCollapsed')

  // Permissions
  const canWrite = !permissionsLoading && can('ALARM_ANALYSIS', 'write')
  const canDelete = !permissionsLoading && can('ALARM_ANALYSIS', 'delete')
  const currentUserId = session?.user?.id

  // Lock days setting: how many days after creation an OPERATOR can no longer edit/delete their own analyses.
  // Uses a dedicated policy endpoint accessible to any authenticated user (no SYSTEM_SETTING permission needed).
  const { data: analysisPolicy } = useQuery({
    queryKey: qk.analyses.policy,
    queryFn: () => api.getAnalysisPolicy(),
    staleTime: 5 * 60 * 1000,
    enabled: !permissionsLoading,
  })
  const lockDays = analysisPolicy?.editLockDays ?? null
  const futureOffsetMinutes = analysisPolicy?.analysisFutureOffsetMinutes ?? null

  // Returns true if the analysis is past the edit lock threshold for this user.
  // Only applies to users with OWN write scope (OPERATOR), for their own analyses.
  const isAnalysisLocked = useCallback(
    (analysis: AlarmAnalysis): boolean => {
      if (lockDays === null) return false
      if (getScope('ALARM_ANALYSIS', 'write') !== 'OWN') return false
      if (analysis.createdById !== currentUserId) return false
      const daysSince = Math.floor((Date.now() - new Date(analysis.createdAt).getTime()) / 86_400_000)
      return daysSince >= lockDays
    },
    [lockDays, getScope, currentUserId]
  )

  const canEditAnalysis = useCallback(
    (analysis: AlarmAnalysis): boolean => {
      if (isAnalysisLocked(analysis)) return false
      return canFor('ALARM_ANALYSIS', 'write', analysis.createdById, currentUserId)
    },
    [canFor, currentUserId, isAnalysisLocked]
  )

  const canDeleteAnalysis = useCallback(
    (analysis: AlarmAnalysis): boolean => {
      if (!canDelete) return false
      if (isAnalysisLocked(analysis)) return false
      return canFor('ALARM_ANALYSIS', 'delete', analysis.createdById, currentUserId)
    },
    [canDelete, canFor, currentUserId, isAnalysisLocked]
  )

  // Is this the "all products" view?
  const isAllView = !effectiveProductId

  // Column definitions - filter product column based on view
  const columnDefs = useMemo(
    () => isAllView ? ANALYSIS_COLUMNS : ANALYSIS_COLUMNS.filter((c) => c.id !== 'product'),
    [isAllView]
  )

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
  } = useColumnSettings('analyses', columnDefs)

  const totalTableMinWidth = useTableMinWidth(visibleColumns, getWidth, canWrite || canDelete)

  // --- Queries ---

  const { data: products } = useQuery<Product[]>({
    queryKey: qk.products.list,
    queryFn: api.getProducts,
  })

  const { data: users } = useQuery<UserDetail[]>({
    queryKey: qk.users.list,
    queryFn: api.getUsers,
    enabled: can('USER', 'read'),
  })

  const { data: analysisAuthors } = useQuery<AnalysisAuthor[]>({
    queryKey: qk.analyses.authors,
    queryFn: api.getAnalysisAuthors,
    enabled: can('ALARM_ANALYSIS', 'read'),
  })

  // Reference data for filter dropdowns (only when viewing a specific product)
  const { data: filterOptions } = useQuery<ProductFilterOptions>({
    queryKey: qk.products.filterOptions(effectiveProductId),
    queryFn: () => api.getFilterOptions(effectiveProductId),
    enabled: !!effectiveProductId,
  })
  const environments  = filterOptions?.environments
  const alarms        = filterOptions?.alarms
  const finalActions  = filterOptions?.finalActions
  const resources     = filterOptions?.resources
  const downstreams   = filterOptions?.downstreams
  const runbooks      = filterOptions?.runbooks

  // Advanced filter data
  const { data: ignoreReasons } = useQuery<IgnoreReason[]>({
    queryKey: qk.ignoreReasons.list,
    queryFn: api.getIgnoreReasons,
    enabled: can('ALARM_ANALYSIS', 'read'),
  })
  const { data: priorityLevels } = useQuery<AlertPriorityLevel[]>({
    queryKey: qk.priorityLevels.list,
    queryFn: api.getPriorityLevels,
    enabled: can('ALARM_ANALYSIS', 'read'),
    staleTime: 5 * 60 * 1000,
  })

  // Working hours & on-call hours for daily/oncall views
  const { data: workingHours } = useQuery({
    queryKey: qk.settings.workingHours,
    queryFn: async () => {
      const s = await api.getSetting('working_hours')
      if (isWorkingHoursSetting(s)) return s.value
      return null
    },
    staleTime: 5 * 60 * 1000,
    enabled: viewMode !== 'list',
  })

  const { data: onCallHours } = useQuery({
    queryKey: qk.settings.onCallHours,
    queryFn: async () => {
      const s = await api.getSetting('on_call_hours')
      if (isOnCallHoursSetting(s)) return s.value
      return null
    },
    staleTime: 5 * 60 * 1000,
    enabled: viewMode === 'oncall',
  })

  // Form-specific data (runbooks, resources, downstreams, plus product-
  // specific environments/alarms/finalActions when editing a cross-product
  // analysis) is fetched inside AnalysisFormDialog to avoid loading it on
  // every page visit.

  // Build query params for analyses (memoised to keep a stable reference for
  // useQuery's queryKey — avoids unnecessary refetches when unrelated state changes).
  const analysisQueryParams = useMemo(() => ({
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(effectiveProductId && { productId: effectiveProductId }),
    ...(filters.search && { search: filters.search }),
    ...(filters.analysisTypes.length > 0 && { analysisType: filters.analysisTypes }),
    ...(filters.statuses.length > 0 && { status: filters.statuses }),
    ...(filters.environmentIds.length > 0 && { environmentId: filters.environmentIds }),
    ...(filters.operatorIds.length > 0 && { operatorId: filters.operatorIds }),
    ...(filters.alarmIds.length > 0 && { alarmId: filters.alarmIds }),
    ...(filters.finalActionIds.length > 0 && { finalActionId: filters.finalActionIds }),
    ...(filters.priorityCodes.length > 0 && { priorityCode: filters.priorityCodes }),
    ...(filters.isOnCall !== undefined && { isOnCall: filters.isOnCall }),
    ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
    ...(filters.dateTo && { dateTo: filters.dateTo }),
    ...(filters.ignoreReasonCodes.length > 0 && { ignoreReasonCode: filters.ignoreReasonCodes }),
    ...(filters.runbookIds.length > 0 && { runbookId: filters.runbookIds }),
    ...(filters.resourceIds.length > 0 && { resourceId: filters.resourceIds }),
    ...(filters.downstreamIds.length > 0 && { downstreamId: filters.downstreamIds }),
    ...(filters.traceId && { traceId: filters.traceId }),
  }), [
    page, pageSize, sortBy, sortOrder, effectiveProductId,
    filters.search, filters.analysisTypes, filters.statuses,
    filters.environmentIds, filters.operatorIds, filters.alarmIds,
    filters.finalActionIds, filters.priorityCodes, filters.isOnCall, filters.dateFrom, filters.dateTo,
    filters.ignoreReasonCodes, filters.runbookIds, filters.resourceIds,
    filters.downstreamIds, filters.traceId,
  ])

  const {
    data: analysesResponse,
    isLoading: analysesLoading,
    isFetching: analysesFetching,
    error: analysesError,
    refetch: refetchAnalyses,
    dataUpdatedAt: analysesUpdatedAt,
  } = useQuery<PaginatedResponse<AlarmAnalysis>>({
    queryKey: qk.analyses.list(analysisQueryParams),
    queryFn: () => api.getAllAnalyses(analysisQueryParams),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  })

  const analyses = analysesResponse?.data
  const pagination = analysesResponse?.pagination

  // Pre-compute validation & quality once per data fetch (avoids calling
  // validateAnalysis/assessQuality on every render for every visible row).
  const validationCache = useMemo(() => {
    if (!analyses) return new Map<string, { validation: ValidationResult; quality: QualityResult }>()
    return new Map(
      analyses.map((a) => [a.id, {
        validation: validateAnalysis(a),
        quality: assessQuality(a),
      }])
    )
  }, [analyses])

  // Product name for the header
  const currentProduct = products?.find(p => p.id === effectiveProductId)

  // --- Mutations ---

  const invalidateAnalyses = useCallback(() => {
    invalidate(queryClient, 'analyses')
  }, [queryClient])

  const createMutation = useMutation({
    mutationFn: (data: CreateAlarmAnalysisData & { productId: string }) => {
      const { productId, ...payload } = data
      return api.createAnalysis(productId, payload)
    },
    onSuccess: () => {
      invalidateAnalyses()
      setPage(1)
      toast.success('Analisi creata con successo')
      setActiveShortcut(null)
      setEditItem(null)
      setFormProductId('')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante la creazione')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ productId, id, data }: { productId: string; id: string; data: UpdateAlarmAnalysisData }) =>
      api.updateAnalysis(productId, id, data),
    onSuccess: () => {
      invalidateAnalyses()
      toast.success('Analisi aggiornata con successo')
      setActiveShortcut(null)
      setEditItem(null)
      setShowDetailPanel(false)
      setSelectedAnalysis(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante l\'aggiornamento')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: ({ productId, id }: { productId: string; id: string }) =>
      api.deleteAnalysis(productId, id),
    onSuccess: () => {
      invalidateAnalyses()
      toast.success('Analisi eliminata con successo')
      setDeleteItem(null)
      setShowDetailPanel(false)
      setSelectedAnalysis(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante l\'eliminazione')
    },
  })

  const isMutating = createMutation.isPending || updateMutation.isPending

  // --- Handlers ---

  const handleFilterChange = useCallback((newFilters: AnalysisFiltersState) => {
    setFilterOverrides(prev => ({ ...prev, [filterKeyRef.current]: newFilters }))
    setPage(1)
    // Debounce save to preferences (1s)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      persistFiltersRef.current(filterKeyRef.current, newFilters as unknown as Record<string, unknown>)
    }, 1000)
  }, [setFilterOverrides, setPage])

  const handleResetFilters = useCallback(() => {
    // Set override to DEFAULT instead of deleting — guarantees immediate UI
    // reset regardless of optimistic preference-update timing.
    setFilterOverrides(prev => ({ ...prev, [filterKeyRef.current]: { ...DEFAULT_FILTERS } }))
    setPage(1)
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    persistFiltersRef.current(filterKeyRef.current, null)
  }, [setFilterOverrides, setPage])



  const handleRowClick = (analysis: AlarmAnalysis) => {
    // Toggle: re-clicking the active row closes the panel
    if (selectedAnalysis?.id === analysis.id && showDetailPanel) {
      handleCloseDetailPanel()
      return
    }
    if (lingeringTimerRef.current) {
      clearTimeout(lingeringTimerRef.current)
      lingeringTimerRef.current = null
    }
    setLingeringId(null)
    setSelectedAnalysis(analysis)
    setShowDetailPanel(true)
  }

  const handleEdit = (analysis: AlarmAnalysis) => {
    setFormProductId(analysis.productId)
    setEditItem(analysis)
    setActiveShortcut('full')
  }

  const handleDelete = (analysis: AlarmAnalysis) => {
    setDeleteItem(analysis)
  }

  const handleShortcutSelect = (type: ShortcutType) => {
    setEditItem(null)
    if (effectiveProductId) {
      setFormProductId(effectiveProductId)
    } else {
      setFormProductId('')
    }
    setActiveShortcut(type)
  }

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setActiveShortcut(null)
      setEditItem(null)
      setFormProductId('')
    }
  }

  const handleFormSubmit = (data: AnalysisFormData) => {
    const targetProductId = editItem?.productId || formProductId || effectiveProductId
    if (!targetProductId) {
      toast.error('Seleziona un prodotto')
      return
    }

    const payload = {
      analysisDate: data.analysisDate,
      firstAlarmAt: data.firstAlarmAt,
      lastAlarmAt: data.lastAlarmAt,
      alarmId: data.alarmId,
      environmentId: data.environmentId,
      operatorId: data.operatorId,
      finalActionIds: data.finalActionIds || [],
      analysisType: (data.analysisType || 'ANALYZABLE') as AnalysisType,
      status: (data.status || 'CREATED') as AnalysisStatus,
      occurrences: data.occurrences ? Number(data.occurrences) : undefined,
      isOnCall: data.isOnCall || false,
      errorDetails: data.errorDetails || null,
      conclusionNotes: data.conclusionNotes || null,
      ignoreReasonCode: data.ignoreReasonCode || null,
      ignoreDetails: data.ignoreDetails || null,
      runbookId: data.runbookId || null,
      resourceIds: data.resourceIds || [],
      downstreamIds: data.downstreamIds || [],
      links: data.links?.filter((l) => l.url) || [],
      trackingIds: data.trackingIds?.filter((t) => t.traceId) || [],
    }

    if (editItem) {
      updateMutation.mutate({ productId: targetProductId, id: editItem.id, data: payload })
    } else {
      createMutation.mutate({ ...payload, productId: targetProductId })
    }
  }

  const handleCloseDetailPanel = () => {
    if (lingeringTimerRef.current) clearTimeout(lingeringTimerRef.current)
    const closingId = selectedAnalysis?.id ?? null
    setShowDetailPanel(false)
    if (closingId) {
      setLingeringId(closingId)
      lingeringTimerRef.current = setTimeout(() => {
        setLingeringId(null)
        setSelectedAnalysis(null)
        lingeringTimerRef.current = null
      }, 900)
    } else {
      setSelectedAnalysis(null)
    }
  }

  // --- Main Render ---

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-baseline gap-3 pb-1">
        <h1 className="text-xl font-semibold tracking-tight">
          {currentProduct ? currentProduct.name : 'Analisi Allarmi'}
        </h1>
        <span className="text-xs text-muted-foreground">
          {currentProduct ? `analisi allarmi` : 'tutti i prodotti'}
        </span>
      </div>

      {/* Filters */}
      <AnalysisFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onReset={handleResetFilters}
        environments={!isAllView ? environments : undefined}
        alarms={!isAllView ? alarms : undefined}
        finalActions={!isAllView ? finalActions : undefined}
        priorityLevels={priorityLevels}
        users={analysisAuthors}
        ignoreReasons={ignoreReasons}
        resources={!isAllView ? resources : undefined}
        downstreams={!isAllView ? downstreams : undefined}
        runbooks={!isAllView ? runbooks : undefined}
        collapsed={filtersCollapsed}
        onToggleCollapsed={handleToggleFiltersCollapsed}
      />

      {/* Results Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {viewMode === 'list' && pagination && (
            <p>
              <span className="font-medium tabular-nums text-foreground">{pagination.totalItems}</span>
              {' '}analisi trovate
              {analyses && analyses.length > 0 && (
                <>
                  {' '}&middot;{' '}
                  <span className="font-medium tabular-nums text-foreground">
                    {analyses.reduce((sum, a) => sum + (a.occurrences ?? 0), 0)}
                  </span>
                  {' '}occorrenze
                </>
              )}
            </p>
          )}
          {analysesUpdatedAt > 0 && (
            <span className="text-xs text-muted-foreground/60">
              agg. {new Date(analysesUpdatedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => refetchAnalyses()}
            disabled={analysesFetching}
            title="Aggiorna dati"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${analysesFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                {viewMode === 'list' && <LayoutList className="h-4 w-4" />}
                {viewMode === 'daily' && <CalendarDays className="h-4 w-4" />}
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
            <CreateAnalysisDropdown onSelect={handleShortcutSelect} />
          )}
        </div>
      </div>

      {/* Daily view */}
      {viewMode === 'daily' && (
        <AnalysisDailyView
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          workingHours={workingHours ?? null}
          filters={filters}
          productId={effectiveProductId}
          visibleColumns={visibleColumns}
          getWidth={getWidth}
          totalMinWidth={totalTableMinWidth}
          canWrite={canWrite}
          canDelete={canDelete}
          selectedAnalysisId={selectedAnalysis?.id ?? null}
          showDetailPanel={showDetailPanel}
          lingeringId={lingeringId}
          onRowClick={handleRowClick}
          onEdit={handleEdit}
          onDelete={handleDelete}
          canEditAnalysis={canEditAnalysis}
          canDeleteAnalysis={canDeleteAnalysis}
          isAnalysisLocked={isAnalysisLocked}
          lockDays={lockDays}
          onValidationClick={setValidationPanelAnalysis}
        />
      )}

      {/* On-call view */}
      {viewMode === 'oncall' && (
        <AnalysisOnCallView
          workingHours={workingHours ?? null}
          onCallHours={onCallHours ?? null}
          filters={filters}
          productId={effectiveProductId}
          visibleColumns={visibleColumns}
          getWidth={getWidth}
          totalMinWidth={totalTableMinWidth}
          canWrite={canWrite}
          canDelete={canDelete}
          selectedAnalysisId={selectedAnalysis?.id ?? null}
          showDetailPanel={showDetailPanel}
          lingeringId={lingeringId}
          onRowClick={handleRowClick}
          onEdit={handleEdit}
          onDelete={handleDelete}
          canEditAnalysis={canEditAnalysis}
          canDeleteAnalysis={canDeleteAnalysis}
          isAnalysisLocked={isAnalysisLocked}
          lockDays={lockDays}
          onValidationClick={setValidationPanelAnalysis}
        />
      )}

      {/* Table (list view) */}
      {viewMode === 'list' && <Card className="overflow-hidden">
        <CardContent className="p-0">
          {analysesLoading ? (
            <div className="divide-y">
              <div className="flex items-center gap-4 bg-muted/30 px-4 py-2.5">
                <Skeleton className="h-3 w-24 rounded" />
                <Skeleton className="h-3 w-20 rounded" />
                <Skeleton className="h-3 w-44 rounded" />
                <Skeleton className="h-3 w-24 rounded" />
                <Skeleton className="h-3 w-32 rounded" />
              </div>
              {Array.from({ length: 7 }, (_, n) => n).map(n => (
                <div
                  key={n}
                  className="flex items-center gap-4 px-4 py-3"
                  style={{ animationDelay: `${n * 40}ms` }}
                >
                  <Skeleton className="h-3.5 w-24 rounded" />
                  <Skeleton className="h-5 w-20 rounded" />
                  <Skeleton className="h-3.5 w-44 rounded" />
                  <Skeleton className="h-3.5 w-20 rounded" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : analysesError && !analyses ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-sm text-destructive">Errore durante il caricamento delle analisi.</p>
            </div>
          ) : analyses && analyses.length > 0 ? (
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
                hasActions={canWrite || canDelete}
              />
              <TableBody>
                {analyses.map((analysis) => (
                  <AnalysisTableRow
                    key={analysis.id}
                    analysis={analysis}
                    isSelected={analysis.id === selectedAnalysis?.id && showDetailPanel}
                    isLingering={analysis.id === lingeringId && !showDetailPanel}
                    visibleColumns={visibleColumns}
                    getWidth={getWidth}
                    hasActions={canWrite || canDelete}
                    showEditAction={canFor('ALARM_ANALYSIS', 'write', analysis.createdById, currentUserId)}
                    isLocked={isAnalysisLocked(analysis)}
                    showDeleteAction={canDeleteAnalysis(analysis)}
                    lockDays={lockDays}
                    validationData={validationCache.get(analysis.id)}
                    onRowClick={handleRowClick}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onValidationClick={setValidationPanelAnalysis}
                  />
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="rounded-2xl bg-muted/60 p-4">
                <Inbox className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Nessuna analisi trovata</p>
                <p className="text-xs text-muted-foreground">Prova a modificare i filtri o crea una nuova analisi.</p>
              </div>
              {canWrite && (
                <Button size="sm" variant="outline" onClick={() => handleShortcutSelect('full')}>
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Crea analisi
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
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size as AllowedPageSize); setPage(1) }}
        />
      )}

      {/* Detail Side Panel */}
      <AnalysisDetailPanel
        analysis={selectedAnalysis}
        open={showDetailPanel}
        onClose={handleCloseDetailPanel}
        onEdit={handleEdit}
        onDelete={handleDelete}
        canWrite={selectedAnalysis ? canEditAnalysis(selectedAnalysis) : false}
        canDelete={selectedAnalysis ? canDeleteAnalysis(selectedAnalysis) : false}
        isLocked={selectedAnalysis ? isAnalysisLocked(selectedAnalysis) : false}
        lockDays={lockDays}
      />

      {/* Validation Detail Panel */}
      <ValidationDetailPanel
        analysis={validationPanelAnalysis}
        open={validationPanelAnalysis !== null}
        onClose={() => setValidationPanelAnalysis(null)}
      />

      {/* Create/Edit Form Dialog (full form) */}
      <AnalysisFormDialog
        open={activeShortcut === 'full'}
        onOpenChange={handleDialogClose}
        editItem={editItem}
        onSubmit={handleFormSubmit}
        isPending={isMutating}
        users={users}
        products={products}
        showProductSelector={isAllView && !editItem}
        selectedProductId={formProductId}
        onProductChange={setFormProductId}
        futureOffsetMinutes={futureOffsetMinutes}
      />

      {/* Shortcut Dialogs */}
      <ShortcutInCorsoDialog
        open={activeShortcut === 'in-corso'}
        onOpenChange={handleDialogClose}
        onSubmit={handleFormSubmit}
        isPending={isMutating}
        products={products}
        showProductSelector={isAllView}
        selectedProductId={formProductId}
        onProductChange={setFormProductId}
      />

      <ShortcutIgnorableDialog
        open={activeShortcut === 'ignorable'}
        onOpenChange={handleDialogClose}
        onSubmit={handleFormSubmit}
        isPending={isMutating}
        products={products}
        showProductSelector={isAllView}
        selectedProductId={formProductId}
        onProductChange={setFormProductId}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={!!deleteItem}
        onOpenChange={() => setDeleteItem(null)}
        description={`Sei sicuro di voler eliminare questa analisi del ${deleteItem ? formatDate(deleteItem.analysisDate) : ''} per l'allarme "${deleteItem?.alarm.name}"? Questa azione non può essere annullata.`}
        onConfirm={() => deleteItem && deleteMutation.mutate({ productId: deleteItem.productId, id: deleteItem.id })}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}
