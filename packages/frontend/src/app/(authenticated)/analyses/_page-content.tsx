'use client'

import { Suspense, useState, useRef, useEffect, useCallback, useMemo, startTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Pencil, Trash2, Plus, Inbox, Lock,
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
} from '@/lib/api-client'
import { usePermissions } from '@/hooks/use-permissions'
import { useCollapsiblePreference } from '@/hooks/use-collapsible-preference'
import { usePageSize, type AllowedPageSize } from '@/hooks/use-page-size'
import { useColumnSettings } from '@/hooks/use-column-settings'
import { COLUMN_REGISTRY } from '@/lib/column-registry'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table'
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog'
import { DataTableHeader, PaginationControls, useTableMinWidth, useSort } from '@/components/data-table'
import { ColumnConfigurator } from '@/components/ui/column-configurator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import dynamic from 'next/dynamic'
import { validateAnalysis, assessQuality, type ValidationResult, type QualityResult } from '@/lib/analysis-validation'
import { ValidationScoreBadge } from '@/components/analysis/validation-score-badge'
import { ValidationDetailPanel } from '@/components/analysis/validation-detail-panel'
import { AnalysisFilters, type AnalysisFiltersState } from './_components/analysis-filters'
import type { AnalysisFormData } from './_components/analysis-form-dialog'
import { AnalysisDetailPanel } from './_components/analysis-detail-panel'
import { CreateAnalysisDropdown, type ShortcutType } from './_components/create-analysis-dropdown'

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

import { formatDate } from './_lib/constants'
import { AnalysisCell } from './_helpers/cell-renderers'

const DEFAULT_FILTERS: AnalysisFiltersState = {
  search: '',
  analysisType: '',
  status: '',
  environmentId: '',
  operatorId: '',
  alarmId: '',
  finalActionId: '',
  isOnCall: undefined,
  dateFrom: '',
  dateTo: '',
  ignoreReasonCode: '',
  runbookId: '',
  microserviceId: '',
  downstreamId: '',
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

  // Filters
  const [filters, setFilters] = useState<AnalysisFiltersState>(DEFAULT_FILTERS)

  // Pagination
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()

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
  const autoOpenedAnalysisRef = useRef<string | null>(null)
  const { data: linkedAnalysis } = useQuery<AlarmAnalysis>({
    queryKey: ['analysis', effectiveProductId, analysisIdFromUrl],
    queryFn: () => api.getAnalysis(effectiveProductId, analysisIdFromUrl),
    enabled: !!analysisIdFromUrl && !!effectiveProductId,
    retry: false,
    staleTime: 30_000,
  })
  useEffect(() => {
    if (linkedAnalysis && autoOpenedAnalysisRef.current !== linkedAnalysis.id) {
      autoOpenedAnalysisRef.current = linkedAnalysis.id
      startTransition(() => {
        setSelectedAnalysis(linkedAnalysis)
        setShowDetailPanel(true)
      })
    }
  }, [linkedAnalysis])

  const { collapsed: filtersCollapsed, toggle: handleToggleFiltersCollapsed } = useCollapsiblePreference('analysisFiltersCollapsed')

  // Permissions
  const canWrite = !permissionsLoading && can('ALARM_ANALYSIS', 'write')
  const canDelete = !permissionsLoading && can('ALARM_ANALYSIS', 'delete')
  const currentUserId = session?.user?.id

  // Lock days setting: how many days after creation an OPERATOR can no longer edit/delete their own analyses.
  // Uses a dedicated policy endpoint accessible to any authenticated user (no SYSTEM_SETTING permission needed).
  const { data: analysisPolicy } = useQuery({
    queryKey: ['analyses', 'policy'],
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
    queryKey: ['products'],
    queryFn: api.getProducts,
  })

  const { data: users } = useQuery<UserDetail[]>({
    queryKey: ['users'],
    queryFn: api.getUsers,
    enabled: can('USER', 'read'),
  })

  const { data: analysisAuthors } = useQuery<AnalysisAuthor[]>({
    queryKey: ['analysis-authors'],
    queryFn: api.getAnalysisAuthors,
    enabled: can('ALARM_ANALYSIS', 'read'),
  })

  // Reference data for filter dropdowns (only when viewing a specific product)
  const { data: filterOptions } = useQuery<ProductFilterOptions>({
    queryKey: ['products', effectiveProductId, 'filter-options'],
    queryFn: () => api.getFilterOptions(effectiveProductId),
    enabled: !!effectiveProductId,
  })
  const environments  = filterOptions?.environments
  const alarms        = filterOptions?.alarms
  const finalActions  = filterOptions?.finalActions
  const microservices = filterOptions?.microservices
  const downstreams   = filterOptions?.downstreams
  const runbooks      = filterOptions?.runbooks

  // Advanced filter data
  const { data: ignoreReasons } = useQuery<IgnoreReason[]>({
    queryKey: ['ignore-reasons'],
    queryFn: api.getIgnoreReasons,
    enabled: can('ALARM_ANALYSIS', 'read'),
  })

  // Form-specific data (runbooks, microservices, downstreams, plus product-
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
    ...(filters.analysisType && { analysisType: filters.analysisType }),
    ...(filters.status && { status: filters.status }),
    ...(filters.environmentId && { environmentId: filters.environmentId }),
    ...(filters.operatorId && { operatorId: filters.operatorId }),
    ...(filters.alarmId && { alarmId: filters.alarmId }),
    ...(filters.finalActionId && { finalActionId: filters.finalActionId }),
    ...(filters.isOnCall !== undefined && { isOnCall: filters.isOnCall }),
    ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
    ...(filters.dateTo && { dateTo: filters.dateTo }),
    ...(filters.ignoreReasonCode && { ignoreReasonCode: filters.ignoreReasonCode }),
    ...(filters.runbookId && { runbookId: filters.runbookId }),
    ...(filters.microserviceId && { microserviceId: filters.microserviceId }),
    ...(filters.downstreamId && { downstreamId: filters.downstreamId }),
    ...(filters.traceId && { traceId: filters.traceId }),
  }), [
    page, pageSize, sortBy, sortOrder, effectiveProductId,
    filters.search, filters.analysisType, filters.status,
    filters.environmentId, filters.operatorId, filters.alarmId,
    filters.finalActionId, filters.isOnCall, filters.dateFrom, filters.dateTo,
    filters.ignoreReasonCode, filters.runbookId, filters.microserviceId,
    filters.downstreamId, filters.traceId,
  ])

  const {
    data: analysesResponse,
    isLoading: analysesLoading,
    error: analysesError,
  } = useQuery<PaginatedResponse<AlarmAnalysis>>({
    queryKey: ['analyses', analysisQueryParams],
    queryFn: () => api.getAllAnalyses(analysisQueryParams),
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

  const createMutation = useMutation({
    mutationFn: (data: CreateAlarmAnalysisData & { productId: string }) => {
      const { productId, ...payload } = data
      return api.createAnalysis(productId, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analyses'] })
      queryClient.invalidateQueries({ queryKey: ['analysis-authors'] })
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
      queryClient.invalidateQueries({ queryKey: ['analyses'] })
      queryClient.invalidateQueries({ queryKey: ['analysis-authors'] })
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
      queryClient.invalidateQueries({ queryKey: ['analyses'] })
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
    setFilters(newFilters)
    setPage(1)
  }, [])

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setPage(1)
  }, [])



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
      microserviceIds: data.microserviceIds || [],
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
        users={analysisAuthors}
        ignoreReasons={ignoreReasons}
        microservices={!isAllView ? microservices : undefined}
        downstreams={!isAllView ? downstreams : undefined}
        runbooks={!isAllView ? runbooks : undefined}
        collapsed={filtersCollapsed}
        onToggleCollapsed={handleToggleFiltersCollapsed}
      />

      {/* Results Bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {pagination ? (
            <>
              <span className="font-medium tabular-nums text-foreground">{pagination.totalItems}</span>
              {' '}analisi trovate
            </>
          ) : analysesLoading ? '' : ''}
        </p>
        <div className="flex items-center gap-2">
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

      {/* Table */}
      <Card className="overflow-hidden">
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
              {[...Array(7)].map((_, i) => (
                <div
                  key={`skeleton-row-${i}`}
                  className="flex items-center gap-4 px-4 py-3"
                  style={{ animationDelay: `${i * 40}ms` }}
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
          ) : analysesError ? (
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
                {analyses.map((analysis) => {
                  const isSelected = analysis.id === selectedAnalysis?.id && showDetailPanel
                  const isLingering = analysis.id === lingeringId && !showDetailPanel
                  return (
                  <TableRow
                    key={analysis.id}
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
                      handleRowClick(analysis)
                    }}
                  >
                    {visibleColumns.map((col, colIdx) => {
                      const isLastDataCol = colIdx === visibleColumns.length - 1
                      const cached = col.id === 'validation' ? validationCache.get(analysis.id) : undefined
                      return (
                        <TableCell
                          key={col.id}
                          className="overflow-hidden py-2.5"
                          style={(!isLastDataCol && getWidth(col.id)) ? { width: `${getWidth(col.id)}px` } : undefined}
                        >
                          {col.id === 'validation' && cached ? (
                            <ValidationScoreBadge
                              validation={cached.validation}
                              quality={cached.quality}
                              onClick={() => setValidationPanelAnalysis(analysis)}
                            />
                          ) : col.id !== 'validation' ? (
                            <AnalysisCell columnId={col.id} analysis={analysis} />
                          ) : null}
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
                          {canFor('ALARM_ANALYSIS', 'write', analysis.createdById, currentUserId) && (
                            isAnalysisLocked(analysis) ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 cursor-default opacity-40" disabled>
                                      <Lock className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left">
                                    <p>Bloccata dopo {lockDays} giorni dalla creazione</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleEdit(analysis)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )
                          )}
                          {canDeleteAnalysis(analysis) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(analysis)}
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
      </Card>

      {/* Pagination */}
      {pagination && (
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
