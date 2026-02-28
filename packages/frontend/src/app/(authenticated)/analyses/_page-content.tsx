'use client'

import { Suspense, useState, useCallback, useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, Plus, Inbox,
  Clock, CheckCircle2, Search, Tag, Wrench, EyeOff, HelpCircle,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  api,
  type Product,
  type AlarmAnalysis,
  type Environment,
  type Alarm,
  type FinalAction,
  type UserDetail,
  type PaginatedResponse,
  type AnalysisType,
  type AnalysisStatus,
  type CreateAlarmAnalysisData,
  type UpdateAlarmAnalysisData,
} from '@/lib/api-client'
import { usePermissions } from '@/hooks/use-permissions'
import { usePreferences } from '@/hooks/use-preferences'
import { usePageSize, type AllowedPageSize } from '@/hooks/use-page-size'
import { useColumnSettings } from '@/hooks/use-column-settings'
import { COLUMN_REGISTRY } from '@/lib/column-registry'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ResizableTableHead } from '@/components/ui/resizable-table-head'
import { ColumnConfigurator } from '@/components/ui/column-configurator'
import dynamic from 'next/dynamic'
import { validateAnalysis, assessQuality } from '@/lib/analysis-validation'
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

const ShortcutDisservizioDialog = dynamic(
  () => import('./_components/shortcut-disservizio-dialog').then((m) => ({ default: m.ShortcutDisservizioDialog })),
  { ssr: false }
)

const ShortcutIgnoreListDialog = dynamic(
  () => import('./_components/shortcut-ignore-list-dialog').then((m) => ({ default: m.ShortcutIgnoreListDialog })),
  { ssr: false }
)

const ShortcutNonGestitoDialog = dynamic(
  () => import('./_components/shortcut-non-gestito-dialog').then((m) => ({ default: m.ShortcutNonGestitoDialog })),
  { ssr: false }
)

import {
  ANALYSIS_TYPE_LABELS,
  ANALYSIS_STATUS_LABELS,
  formatDate,
  formatDateTimeRome,
  formatDateTimeUTC,
} from './_lib/constants'

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
}

// --- Column Definitions (from shared registry) ---
const ANALYSIS_COLUMNS = COLUMN_REGISTRY.analyses

const STATUS_ICONS: Record<AnalysisStatus, { Icon: LucideIcon; className: string }> = {
  CREATED:     { Icon: Clock,        className: 'text-slate-400 dark:text-slate-500' },
  IN_PROGRESS: { Icon: Loader2,      className: 'text-amber-500 dark:text-amber-400' },
  COMPLETED:   { Icon: CheckCircle2, className: 'text-emerald-500 dark:text-emerald-400' },
}

const TYPE_ICONS: Record<AnalysisType, { Icon: LucideIcon; className: string }> = {
  ANALYZABLE:          { Icon: Search,      className: 'text-blue-500 dark:text-blue-400' },
  IGNORED_RELEASE:     { Icon: Tag,         className: 'text-violet-400 dark:text-violet-300' },
  IGNORED_MAINTENANCE: { Icon: Wrench,      className: 'text-orange-400 dark:text-orange-300' },
  IGNORED_LISTED:      { Icon: EyeOff,      className: 'text-slate-400 dark:text-slate-500' },
  IGNORED_NOT_MANAGED: { Icon: HelpCircle,  className: 'text-rose-400 dark:text-rose-400' },
}

function renderCell(columnId: string, analysis: AlarmAnalysis): ReactNode {
  switch (columnId) {
    case 'analysisDate':
      // Stored as UTC, but entered as Rome local time — display in Rome TZ
      return <span className="font-mono text-xs tabular-nums">{formatDateTimeRome(analysis.analysisDate)}</span>
    case 'product':
      return (
        <span className="inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium text-foreground/75">
          {analysis.product.name}
        </span>
      )
    case 'alarm':
      return <span className="block truncate font-medium text-sm">{analysis.alarm.name}</span>
    case 'environment':
      return <span className="block truncate text-sm text-muted-foreground">{analysis.environment.name}</span>
    case 'analysisType': {
      const { Icon, className } = TYPE_ICONS[analysis.analysisType]
      return (
        <span title={ANALYSIS_TYPE_LABELS[analysis.analysisType]} className="flex items-center">
          <Icon className={`h-4 w-4 ${className}`} />
        </span>
      )
    }
    case 'status': {
      const { Icon, className } = STATUS_ICONS[analysis.status]
      return (
        <span title={ANALYSIS_STATUS_LABELS[analysis.status]} className="flex items-center">
          <Icon className={`h-4 w-4 ${className}`} />
        </span>
      )
    }
    case 'operator':
      return <span className="block truncate text-sm">{analysis.operator.name}</span>
    case 'finalAction': {
      const names = analysis.finalActions.map(fa => fa.name)
      if (!names.length) return <span className="text-muted-foreground/40 text-sm">—</span>
      return <span className="block truncate text-sm">{names.join(', ')}</span>
    }
    case 'isOnCall':
      return (
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${analysis.isOnCall ? 'bg-emerald-500' : 'bg-muted-foreground/25'}`} />
          <span className="text-sm">{analysis.isOnCall ? 'Sì' : 'No'}</span>
        </span>
      )
    case 'occurrences':
      return <span className="tabular-nums font-medium text-sm">{analysis.occurrences}</span>
    case 'firstAlarmAt':
      // Alarm timestamps are UTC from monitoring systems — display as UTC in the table
      return <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatDateTimeUTC(analysis.firstAlarmAt)}</span>
    case 'lastAlarmAt':
      return <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatDateTimeUTC(analysis.lastAlarmAt)}</span>
    case 'errorDetails':
      return <span className="block truncate text-sm text-muted-foreground">{analysis.errorDetails || '—'}</span>
    case 'conclusionNotes':
      return <span className="block truncate text-sm text-muted-foreground">{analysis.conclusionNotes || '—'}</span>
    // 'validation' is rendered inline in the table row (not via renderCell)
    default:
      return null
  }
}

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
  const { can, canFor, isLoading: permissionsLoading } = usePermissions()
  const { preferences, updatePreferences } = usePreferences()
  const searchParams = useSearchParams()

  // Product from URL search params (optional)
  const productIdFromUrl = searchParams.get('productId') || ''

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
  const [sortBy, setSortBy] = useState<string>('analysisDate')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // UI state
  const [selectedAnalysis, setSelectedAnalysis] = useState<AlarmAnalysis | null>(null)
  const [showDetailPanel, setShowDetailPanel] = useState(false)
  const [activeShortcut, setActiveShortcut] = useState<ShortcutType | null>(null)
  const [editItem, setEditItem] = useState<AlarmAnalysis | null>(null)
  const [deleteItem, setDeleteItem] = useState<AlarmAnalysis | null>(null)
  const [validationPanelAnalysis, setValidationPanelAnalysis] = useState<AlarmAnalysis | null>(null)

  // Filters collapsed (default: true = collapsed)
  const filtersCollapsed = preferences.analysisFiltersCollapsed ?? true

  const handleToggleFiltersCollapsed = useCallback(() => {
    updatePreferences({ analysisFiltersCollapsed: !filtersCollapsed })
  }, [filtersCollapsed, updatePreferences])

  // Permissions
  const canWrite = !permissionsLoading && can('ALARM_ANALYSIS', 'write')
  const canDelete = !permissionsLoading && can('ALARM_ANALYSIS', 'delete')
  const currentUserId = session?.user?.id

  const canEditAnalysis = useCallback(
    (analysis: AlarmAnalysis): boolean => {
      return canFor('ALARM_ANALYSIS', 'write', analysis.createdById, currentUserId)
    },
    [canFor, currentUserId]
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

  // Min-width needed before horizontal scroll kicks in.
  // The last visible data column has no explicit width so it can expand to fill
  // the remaining space; we only need its minWidth here.
  const totalTableMinWidth = useMemo(() => {
    if (visibleColumns.length === 0) return 0
    const lastIdx = visibleColumns.length - 1
    const nonLastSum = visibleColumns
      .slice(0, lastIdx)
      .reduce((sum, col) => sum + (getWidth(col.id) ?? col.defaultWidth ?? 150), 0)
    const lastColMin = visibleColumns[lastIdx]?.minWidth ?? 80
    const actionsWidth = canWrite || canDelete ? 80 : 0
    return nonLastSum + lastColMin + actionsWidth
  }, [visibleColumns, getWidth, canWrite, canDelete])

  // --- Queries ---

  const { data: products } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: api.getProducts,
  })

  const { data: users } = useQuery<UserDetail[]>({
    queryKey: ['users'],
    queryFn: api.getUsers,
  })

  // Reference data for filter dropdowns (only when viewing a specific product)
  const { data: environments } = useQuery<Environment[]>({
    queryKey: ['products', effectiveProductId, 'environments'],
    queryFn: () => api.getEnvironments(effectiveProductId),
    enabled: !!effectiveProductId,
  })

  const { data: alarms } = useQuery<Alarm[]>({
    queryKey: ['products', effectiveProductId, 'alarms'],
    queryFn: () => api.getAlarms(effectiveProductId),
    enabled: !!effectiveProductId,
  })

  const { data: finalActions } = useQuery<FinalAction[]>({
    queryKey: ['products', effectiveProductId, 'final-actions'],
    queryFn: () => api.getFinalActions(effectiveProductId),
    enabled: !!effectiveProductId,
  })

  // Form-specific data (runbooks, microservices, downstreams, plus product-
  // specific environments/alarms/finalActions when editing a cross-product
  // analysis) is fetched inside AnalysisFormDialog to avoid loading it on
  // every page visit.

  // Build query params for analyses
  const analysisQueryParams = {
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
  }

  const {
    data: analysesResponse,
    isLoading: analysesLoading,
    error: analysesError,
  } = useQuery<PaginatedResponse<AlarmAnalysis>>({
    queryKey: ['analyses', analysisQueryParams],
    queryFn: () => api.getAllAnalyses(analysisQueryParams),
  })

  const analyses = analysesResponse?.data
  const pagination = analysesResponse?.pagination

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

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  const handleRowClick = (analysis: AlarmAnalysis) => {
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
      externalTeamName: data.externalTeamName || null,
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
    setShowDetailPanel(false)
    setSelectedAnalysis(null)
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
        users={users}
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
                  key={i}
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
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30 border-b">
                  {visibleColumns.map((col, colIdx) => {
                    const isLastDataCol = colIdx === visibleColumns.length - 1
                    return (
                      <ResizableTableHead
                        key={col.id}
                        // Last data column: no explicit width → fills remaining space.
                        // Use stored/default width as minWidth so it doesn't collapse.
                        width={isLastDataCol ? undefined : (getWidth(col.id) ?? col.defaultWidth)}
                        minWidth={isLastDataCol ? (getWidth(col.id) ?? col.defaultWidth ?? col.minWidth) : col.minWidth}
                        onResize={(w) => setWidth(col.id, w)}
                        sortable={!!col.sortKey}
                        sorted={col.sortKey && sortBy === col.sortKey ? sortOrder : false}
                        onSort={col.sortKey ? () => handleSort(col.sortKey!) : undefined}
                      >
                        {col.label}
                      </ResizableTableHead>
                    )
                  })}
                  {(canWrite || canDelete) && (
                    <ResizableTableHead
                      width={80}
                      minWidth={80}
                      className="sticky right-0 z-10 border-l border-border/40 bg-muted/30 text-right"
                    >
                      <span className="sr-only">Azioni</span>
                    </ResizableTableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {analyses.map((analysis) => (
                  <TableRow
                    key={analysis.id}
                    className="group cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/30"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button')) return
                      handleRowClick(analysis)
                    }}
                  >
                    {visibleColumns.map((col, colIdx) => {
                      const isLastDataCol = colIdx === visibleColumns.length - 1
                      return (
                        <TableCell
                          key={col.id}
                          className="overflow-hidden py-2.5"
                          style={(!isLastDataCol && getWidth(col.id)) ? { width: `${getWidth(col.id)}px` } : undefined}
                        >
                          {col.id === 'validation' ? (
                            <ValidationScoreBadge
                              validation={validateAnalysis(analysis)}
                              quality={assessQuality(analysis)}
                              onClick={() => setValidationPanelAnalysis(analysis)}
                            />
                          ) : (
                            renderCell(col.id, analysis)
                          )}
                        </TableCell>
                      )
                    })}
                    {(canWrite || canDelete) && (
                      <TableCell className="sticky right-0 z-10 border-l border-border/40 bg-card py-2 text-right group-hover:bg-muted/30">
                        <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          {canEditAnalysis(analysis) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleEdit(analysis)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDelete && (
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
      </Card>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Righe per pagina</span>
            <Select
              value={String(pageSize)}
              onValueChange={(val) => {
                setPageSize(Number(val) as AllowedPageSize)
                setPage(1)
              }}
            >
              <SelectTrigger className="h-7 w-[70px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs tabular-nums text-muted-foreground">
              {pagination.page} / {pagination.totalPages}
            </span>
            <div className="flex gap-0.5">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={!pagination.hasPreviousPage}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={!pagination.hasNextPage}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Side Panel */}
      <AnalysisDetailPanel
        analysis={selectedAnalysis}
        open={showDetailPanel}
        onClose={handleCloseDetailPanel}
        onEdit={handleEdit}
        onDelete={handleDelete}
        canWrite={selectedAnalysis ? canEditAnalysis(selectedAnalysis) : false}
        canDelete={canDelete}
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

      <ShortcutDisservizioDialog
        open={activeShortcut === 'disservizio'}
        onOpenChange={handleDialogClose}
        onSubmit={handleFormSubmit}
        isPending={isMutating}
        products={products}
        showProductSelector={isAllView}
        selectedProductId={formProductId}
        onProductChange={setFormProductId}
      />

      <ShortcutIgnoreListDialog
        open={activeShortcut === 'ignore-list'}
        onOpenChange={handleDialogClose}
        onSubmit={handleFormSubmit}
        isPending={isMutating}
        products={products}
        showProductSelector={isAllView}
        selectedProductId={formProductId}
        onProductChange={setFormProductId}
      />

      <ShortcutNonGestitoDialog
        open={activeShortcut === 'non-gestito'}
        onOpenChange={handleDialogClose}
        onSubmit={handleFormSubmit}
        isPending={isMutating}
        products={products}
        showProductSelector={isAllView}
        selectedProductId={formProductId}
        onProductChange={setFormProductId}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questa analisi del{' '}
              {deleteItem && formatDate(deleteItem.analysisDate)} per l&apos;allarme &quot;{deleteItem?.alarm.name}&quot;?
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteItem && deleteMutation.mutate({ productId: deleteItem.productId, id: deleteItem.id })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
