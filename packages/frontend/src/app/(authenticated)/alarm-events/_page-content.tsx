'use client'

import { Suspense, useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, Plus, Inbox, RefreshCw,
  LayoutList, CalendarDays, PhoneCall,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  api,
  type Product,
  type AlarmEvent,
  type Environment,
  type PaginatedResponse,
  type CreateAlarmEventData,
  type UpdateAlarmEventData,
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
import { isWorkingHoursSetting, isOnCallHoursSetting } from '@go-watchtower/shared'
import { AlarmEventFilters, type AlarmEventFiltersState } from './_components/alarm-event-filters'
import { AlarmEventDetailPanel } from './_components/alarm-event-detail-panel'
import { AlarmEventDailyView, todayUTC } from './_components/alarm-event-daily-view'

const AlarmEventOnCallView = dynamic(
  () => import('./_components/alarm-event-oncall-view').then((m) => ({ default: m.AlarmEventOnCallView })),
  { ssr: false }
)
import { renderCell } from './_helpers/cell-renderers'

const AlarmEventFormDialog = dynamic(
  () => import('./_components/alarm-event-form-dialog').then((m) => ({ default: m.AlarmEventFormDialog })),
  { ssr: false }
)

const DEFAULT_FILTERS: AlarmEventFiltersState = {
  productId:    '',
  environmentId: '',
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

  // Filters
  const [filters, setFilters] = useState<AlarmEventFiltersState>(DEFAULT_FILTERS)

  // Pagination
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()

  // Sorting
  const [sortBy, setSortBy] = useState<string>('firedAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

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

  // View mode — persisted in user preferences.
  // Initialized to 'list'; synced once preferences load from the server
  // (staleTime=Infinity, so subsequent navigations resolve from cache synchronously).
  const [viewMode, setViewMode] = useState<'list' | 'daily' | 'oncall'>('list')
  const viewModeInitialized = useRef(false)
  useEffect(() => {
    if (!viewModeInitialized.current && preferences.alarmEventViewMode) {
      viewModeInitialized.current = true
      setViewMode(preferences.alarmEventViewMode)
    }
  }, [preferences.alarmEventViewMode])

  const handleSetViewMode = useCallback((mode: 'list' | 'daily' | 'oncall') => {
    viewModeInitialized.current = true
    setViewMode(mode)
    updatePreferences({ alarmEventViewMode: mode })
  }, [updatePreferences])
  const [selectedDate, setSelectedDate] = useState<string>(() => todayUTC())

  // Filters collapsed
  const [userCollapsedOverride, setUserCollapsedOverride] = useState<boolean | null>(null)
  const filtersCollapsed = userCollapsedOverride !== null
    ? userCollapsedOverride
    : (preferences.alarmEventFiltersCollapsed ?? true)

  const handleToggleFiltersCollapsed = useCallback(() => {
    const next = !filtersCollapsed
    setUserCollapsedOverride(next)
    updatePreferences({ alarmEventFiltersCollapsed: next })
  }, [filtersCollapsed, updatePreferences])

  // Permissions
  const canWrite  = !permissionsLoading && can('ALARM_EVENT', 'write')
  const canDelete = !permissionsLoading && can('ALARM_EVENT', 'delete')

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

  const totalTableMinWidth = useMemo(() => {
    if (visibleColumns.length === 0) return 0
    const lastIdx = visibleColumns.length - 1
    const nonLastSum = visibleColumns
      .slice(0, lastIdx)
      .reduce((sum, col) => sum + (getWidth(col.id) ?? col.defaultWidth ?? 150), 0)
    const lastDataCol = visibleColumns[lastIdx]
    const lastColMin = lastDataCol
      ? (getWidth(lastDataCol.id) ?? lastDataCol.defaultWidth ?? lastDataCol.minWidth ?? 80)
      : 80
    const actionsWidth = canWrite || canDelete ? 80 : 0
    return nonLastSum + lastColMin + actionsWidth
  }, [visibleColumns, getWidth, canWrite, canDelete])

  // --- Queries ---

  const { data: products } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: api.getProducts,
  })

  const { data: environments } = useQuery<Environment[]>({
    queryKey: ['products', filters.productId, 'environments'],
    queryFn: () => api.getEnvironments(filters.productId),
    enabled: !!filters.productId,
  })

  const queryParams = useMemo(() => ({
    page,
    pageSize,
    ...(filters.productId    && { productId:    filters.productId }),
    ...(filters.environmentId && { environmentId: filters.environmentId }),
    ...(filters.awsAccountId && { awsAccountId: filters.awsAccountId }),
    ...(filters.awsRegion    && { awsRegion:    filters.awsRegion }),
    ...(filters.dateFrom     && { dateFrom:     filters.dateFrom }),
    ...(filters.dateTo       && { dateTo:       filters.dateTo }),
  }), [
    page, pageSize,
    filters.productId, filters.environmentId, filters.awsAccountId,
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
    queryKey: ['alarm-events', queryParams],
    queryFn: () => api.getAlarmEvents(queryParams),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const events     = eventsResponse?.data
  const pagination = eventsResponse?.pagination

  // Working hours — fetched with fallback so non-admin users still get defaults
  const { data: workingHours } = useQuery({
    queryKey: ['working-hours'],
    queryFn:  async () => {
      try {
        const s = await api.getSetting('working_hours')
        if (isWorkingHoursSetting(s)) return s.value
      } catch { /* non-admin: fallback */ }
      return null
    },
    staleTime: 5 * 60 * 1000,
  })

  // On-call hours — optional, shown only when configured
  const { data: onCallHours } = useQuery({
    queryKey: ['on-call-hours'],
    queryFn:  async () => {
      try {
        const s = await api.getSetting('on_call_hours')
        if (isOnCallHoursSetting(s)) return s.value
      } catch { /* non-admin or not configured: skip */ }
      return null
    },
    staleTime: 5 * 60 * 1000,
  })

  // --- Mutations ---

  const createMutation = useMutation({
    mutationFn: (data: CreateAlarmEventData) => api.createAlarmEvent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alarm-events'] })
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
      queryClient.invalidateQueries({ queryKey: ['alarm-events'] })
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
      queryClient.invalidateQueries({ queryKey: ['alarm-events'] })
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
        products={products}
        environments={filters.productId ? environments : undefined}
        collapsed={filtersCollapsed}
        onToggleCollapsed={handleToggleFiltersCollapsed}
      />

      {/* Results Bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {viewMode === 'list' && pagination ? (
            <>
              <span className="font-medium tabular-nums text-foreground">{pagination.totalItems}</span>
              {' '}allarmi trovati
              {eventsUpdatedAt > 0 && (
                <span className="ml-2 text-xs text-muted-foreground/50">
                  · aggiornato alle{' '}
                  {new Date(eventsUpdatedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </>
          ) : eventsLoading && viewMode === 'list' ? '' : ''}
        </p>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center gap-0.5 rounded-md border bg-card p-0.5">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 gap-1.5 px-2 text-xs"
              onClick={() => handleSetViewMode('list')}
            >
              <LayoutList className="h-3 w-3" />
              Lista
            </Button>
            <Button
              variant={viewMode === 'daily' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 gap-1.5 px-2 text-xs"
              onClick={() => handleSetViewMode('daily')}
            >
              <CalendarDays className="h-3 w-3" />
              Giornaliero
            </Button>
            <Button
              variant={viewMode === 'oncall' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 gap-1.5 px-2 text-xs"
              onClick={() => handleSetViewMode('oncall')}
            >
              <PhoneCall className="h-3 w-3" />
              Reperibilità
            </Button>
          </div>

          {viewMode === 'list' && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => refetchEvents()}
              disabled={eventsFetching}
              title="Aggiorna"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${eventsFetching ? 'animate-spin' : ''}`} />
              <span className="text-xs">Aggiorna</span>
            </Button>
          )}
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
          selectedEventId={selectedEvent?.id ?? null}
          showDetailPanel={showDetailPanel}
          lingeringId={lingeringId}
          onRowClick={handleRowClick}
          onEdit={handleEdit}
          onDelete={handleDelete}
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
          selectedEventId={selectedEvent?.id ?? null}
          showDetailPanel={showDetailPanel}
          lingeringId={lingeringId}
          onRowClick={handleRowClick}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      {/* Table (list view) */}
      {viewMode === 'list' && <Card className="overflow-hidden">
        <CardContent className="p-0">
          {eventsLoading ? (
            <div className="divide-y">
              <div className="flex items-center gap-4 bg-muted/30 px-4 py-2.5">
                {[24, 20, 14, 14, 16].map((w, i) => (
                  <Skeleton key={i} className={`h-3 w-${w} rounded`} />
                ))}
              </div>
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3" style={{ animationDelay: `${i * 40}ms` }}>
                  <Skeleton className="h-3.5 w-32 rounded" />
                  <Skeleton className="h-3.5 w-44 rounded" />
                  <Skeleton className="h-5 w-20 rounded" />
                  <Skeleton className="h-3.5 w-20 rounded" />
                  <Skeleton className="h-3.5 w-24 rounded" />
                </div>
              ))}
            </div>
          ) : eventsError ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-sm text-destructive">Errore durante il caricamento degli allarmi.</p>
            </div>
          ) : events && events.length > 0 ? (
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
                      className="sticky right-0 z-10 border-l border-border/40 bg-muted text-right"
                    >
                      <span className="sr-only">Azioni</span>
                    </ResizableTableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => {
                  const isSelected  = event.id === selectedEvent?.id && showDetailPanel
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
                        handleRowClick(event)
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
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleEdit(event)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => handleDelete(event)}
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
      {viewMode === 'list' && pagination && pagination.totalPages > 1 && (
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
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Side Panel */}
      <AlarmEventDetailPanel
        event={selectedEvent}
        open={showDetailPanel}
        onClose={handleCloseDetailPanel}
        onEdit={handleEdit}
        onDelete={handleDelete}
        canWrite={canWrite}
        canDelete={canDelete}
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
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare l&apos;allarme &quot;{deleteItem?.name}&quot;?
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
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
