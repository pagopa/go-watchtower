'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
  X,
  Filter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api-client'
import type { SystemEvent, SystemEventsFilters } from '@/lib/api-client'
import { SystemEventActions, SystemEventResources } from '@go-watchtower/shared'

// ─── Badge color logic ──────────────────────────────────────────────────────

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

interface ActionBadgeConfig {
  label: string
  variant: BadgeVariant
  className: string
}

function getActionBadgeConfig(action: string): ActionBadgeConfig {
  // Auth - login
  if (action === SystemEventActions.USER_LOGIN || action === SystemEventActions.USER_LOGIN_GOOGLE) {
    return { label: action, variant: 'default', className: 'bg-blue-500/15 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800' }
  }
  // Auth - logout
  if (action === SystemEventActions.USER_LOGOUT || action === SystemEventActions.USER_TOKEN_REVOKED) {
    return { label: action, variant: 'default', className: 'bg-sky-500/15 text-sky-700 border-sky-200 dark:text-sky-400 dark:border-sky-800' }
  }
  // Auth - failed
  if (action === SystemEventActions.USER_LOGIN_FAILED) {
    return { label: action, variant: 'destructive', className: 'bg-red-500/15 text-red-700 border-red-200 dark:text-red-400 dark:border-red-800' }
  }
  // Created events
  if (action.endsWith('_CREATED')) {
    return { label: action, variant: 'default', className: 'bg-emerald-500/15 text-emerald-700 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800' }
  }
  // Updated events
  if (action.endsWith('_UPDATED') || action.endsWith('_CHANGED')) {
    return { label: action, variant: 'default', className: 'bg-amber-500/15 text-amber-700 border-amber-200 dark:text-amber-400 dark:border-amber-800' }
  }
  // Deleted events
  if (action.endsWith('_DELETED')) {
    return { label: action, variant: 'destructive', className: 'bg-red-500/15 text-red-700 border-red-200 dark:text-red-400 dark:border-red-800' }
  }
  // Activated
  if (action === SystemEventActions.USER_ACTIVATED) {
    return { label: action, variant: 'default', className: 'bg-green-500/15 text-green-700 border-green-200 dark:text-green-400 dark:border-green-800' }
  }
  // Deactivated
  if (action === SystemEventActions.USER_DEACTIVATED) {
    return { label: action, variant: 'default', className: 'bg-orange-500/15 text-orange-700 border-orange-200 dark:text-orange-400 dark:border-orange-800' }
  }
  // Default
  return { label: action, variant: 'secondary', className: '' }
}

// ─── Resource label ──────────────────────────────────────────────────────────

const RESOURCE_LABELS: Record<string, string> = {
  [SystemEventResources.AUTH]: 'Auth',
  [SystemEventResources.USERS]: 'Utenti',
  [SystemEventResources.ALARM_ANALYSES]: 'Analisi',
  [SystemEventResources.SYSTEM_SETTINGS]: 'Impostazioni',
  [SystemEventResources.PRODUCTS]: 'Prodotti',
  [SystemEventResources.ALARMS]: 'Allarmi',
  [SystemEventResources.IGNORED_ALARMS]: 'Allarmi Ignorati',
  [SystemEventResources.USER_PERMISSION_OVERRIDES]: 'Override Permessi',
}

// ─── Action labels ──────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  [SystemEventActions.USER_LOGIN]: 'Login',
  [SystemEventActions.USER_LOGIN_GOOGLE]: 'Login Google',
  [SystemEventActions.USER_LOGIN_FAILED]: 'Login Fallito',
  [SystemEventActions.USER_LOGOUT]: 'Logout',
  [SystemEventActions.USER_TOKEN_REVOKED]: 'Token Revocato',
  [SystemEventActions.USER_CREATED]: 'Utente Creato',
  [SystemEventActions.USER_UPDATED]: 'Utente Aggiornato',
  [SystemEventActions.USER_ACTIVATED]: 'Utente Attivato',
  [SystemEventActions.USER_DEACTIVATED]: 'Utente Disattivato',
  [SystemEventActions.USER_DELETED]: 'Utente Eliminato',
  [SystemEventActions.USER_PASSWORD_CHANGED]: 'Password Cambiata',
  [SystemEventActions.USER_ROLE_CHANGED]: 'Ruolo Cambiato',
  [SystemEventActions.PERMISSION_OVERRIDE_CREATED]: 'Override Creato',
  [SystemEventActions.PERMISSION_OVERRIDE_UPDATED]: 'Override Aggiornato',
  [SystemEventActions.PERMISSION_OVERRIDE_DELETED]: 'Override Eliminato',
  [SystemEventActions.ANALYSIS_CREATED]: 'Analisi Creata',
  [SystemEventActions.ANALYSIS_UPDATED]: 'Analisi Aggiornata',
  [SystemEventActions.ANALYSIS_DELETED]: 'Analisi Eliminata',
  [SystemEventActions.ANALYSIS_STATUS_CHANGED]: 'Stato Analisi Cambiato',
  [SystemEventActions.SETTING_UPDATED]: 'Impostazione Aggiornata',
  [SystemEventActions.PRODUCT_CREATED]: 'Prodotto Creato',
  [SystemEventActions.PRODUCT_UPDATED]: 'Prodotto Aggiornato',
  [SystemEventActions.PRODUCT_DELETED]: 'Prodotto Eliminato',
  [SystemEventActions.ALARM_CREATED]: 'Allarme Creato',
  [SystemEventActions.ALARM_UPDATED]: 'Allarme Aggiornato',
  [SystemEventActions.ALARM_DELETED]: 'Allarme Eliminato',
  [SystemEventActions.IGNORED_ALARM_CREATED]: 'Allarme Ignorato Creato',
  [SystemEventActions.IGNORED_ALARM_UPDATED]: 'Allarme Ignorato Aggiornato',
  [SystemEventActions.IGNORED_ALARM_DELETED]: 'Allarme Ignorato Eliminato',
}

// ─── Multiselect for actions ─────────────────────────────────────────────────

function ActionMultiSelect({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (values: string[]) => void
}) {
  const allActions = Object.values(SystemEventActions)
  const [open, setOpen] = useState(false)

  const toggle = (action: string) => {
    if (selected.includes(action)) {
      onChange(selected.filter((a) => a !== action))
    } else {
      onChange([...selected, action])
    }
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-between text-xs h-9"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">
          {selected.length === 0
            ? 'Tutte le azioni'
            : `${selected.length} ${selected.length === 1 ? 'azione' : 'azioni'}`}
        </span>
        {open ? <ChevronUp className="h-3 w-3 ml-1 shrink-0" /> : <ChevronDown className="h-3 w-3 ml-1 shrink-0" />}
      </Button>
      {open && (
        <div className="absolute z-50 mt-1 w-72 max-h-64 overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {selected.length > 0 && (
            <button
              className="w-full text-left px-2 py-1 text-xs text-muted-foreground hover:bg-accent rounded"
              onClick={() => onChange([])}
            >
              Deseleziona tutto
            </button>
          )}
          {allActions.map((action) => {
            const isSelected = selected.includes(action)
            const config = getActionBadgeConfig(action)
            return (
              <button
                key={action}
                className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent rounded flex items-center gap-2"
                onClick={() => toggle(action)}
              >
                <div
                  className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${
                    isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                  }`}
                >
                  {isSelected && (
                    <svg className="h-2.5 w-2.5 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.className}`}>
                  {ACTION_LABELS[action] ?? action}
                </Badge>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Expanded row ────────────────────────────────────────────────────────────

function MetadataPanel({ event }: { event: SystemEvent }) {
  const metadata = event.metadata
  const hasMetadata = metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0

  return (
    <div className="px-6 py-4 bg-muted/30 space-y-3 text-xs">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <span className="font-medium text-muted-foreground">ID Evento</span>
          <p className="font-mono mt-0.5 break-all">{event.id}</p>
        </div>
        <div>
          <span className="font-medium text-muted-foreground">Risorsa ID</span>
          <p className="font-mono mt-0.5 break-all">{event.resourceId ?? '-'}</p>
        </div>
        <div>
          <span className="font-medium text-muted-foreground">IP Address</span>
          <p className="mt-0.5">{event.ipAddress ?? '-'}</p>
        </div>
        <div>
          <span className="font-medium text-muted-foreground">User Agent</span>
          <p className="mt-0.5 truncate" title={event.userAgent ?? undefined}>
            {event.userAgent ?? '-'}
          </p>
        </div>
      </div>
      {hasMetadata && (
        <div>
          <span className="font-medium text-muted-foreground">Metadata</span>
          <pre className="mt-1 p-3 rounded bg-muted font-mono text-[11px] overflow-x-auto">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function SystemEventsPage() {
  const [filters, setFilters] = useState<SystemEventsFilters>({
    page: 1,
    limit: 50,
  })
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['system-events', filters],
    queryFn: () => api.getSystemEvents(filters),
    placeholderData: (prev) => prev,
    staleTime: 0,
  })

  const events = data?.data ?? []
  const total = data?.total ?? 0
  const page = data?.page ?? 1
  const totalPages = data?.totalPages ?? 1

  const allResources = useMemo(() => Object.values(SystemEventResources), [])

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const updateFilters = (patch: Partial<SystemEventsFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch, page: patch.page ?? 1 }))
  }

  const clearFilters = () => {
    setFilters({ page: 1, limit: 50 })
  }

  const hasActiveFilters = Boolean(
    (filters.action && filters.action.length > 0) ||
    filters.resource ||
    filters.userId ||
    filters.dateFrom ||
    filters.dateTo
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Log Eventi di Sistema</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registro di audit con tutte le azioni eseguite nel sistema
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs gap-1">
              <X className="h-3 w-3" />
              Cancella filtri
            </Button>
          )}
          <Button
            variant={showFilters ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-1"
          >
            <Filter className="h-3.5 w-3.5" />
            Filtri
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                {[
                  filters.action?.length ? 1 : 0,
                  filters.resource ? 1 : 0,
                  filters.userId ? 1 : 0,
                  filters.dateFrom ? 1 : 0,
                  filters.dateTo ? 1 : 0,
                ].reduce((a, b) => a + b, 0)}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Filtri</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Azione</Label>
              <ActionMultiSelect
                selected={filters.action ?? []}
                onChange={(action) => updateFilters({ action })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Risorsa</Label>
              <Select
                value={filters.resource ?? '__all__'}
                onValueChange={(v) => updateFilters({ resource: v === '__all__' ? undefined : v })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Tutte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tutte</SelectItem>
                  {allResources.map((r) => (
                    <SelectItem key={r} value={r}>
                      {RESOURCE_LABELS[r] ?? r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Utente (ID)</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="ID utente..."
                  value={filters.userId ?? ''}
                  onChange={(e) => updateFilters({ userId: e.target.value || undefined })}
                  className="pl-8 h-9 text-xs"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data inizio</Label>
              <Input
                type="datetime-local"
                value={filters.dateFrom ?? ''}
                onChange={(e) => updateFilters({ dateFrom: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data fine</Label>
              <Input
                type="datetime-local"
                value={filters.dateTo ?? ''}
                onChange={(e) => updateFilters({ dateTo: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                className="h-9 text-xs"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p className="text-sm">Nessun evento trovato</p>
              {hasActiveFilters && (
                <Button variant="link" size="sm" onClick={clearFilters} className="mt-1 text-xs">
                  Cancella i filtri
                </Button>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[28px]" />
                    <TableHead className="text-xs w-[160px]">Quando</TableHead>
                    <TableHead className="text-xs w-[200px]">Azione</TableHead>
                    <TableHead className="text-xs">Utente</TableHead>
                    <TableHead className="text-xs">Risorsa</TableHead>
                    <TableHead className="text-xs w-[120px]">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => {
                    const isExpanded = expandedRows.has(event.id)
                    const badgeConfig = getActionBadgeConfig(event.action)
                    return (
                      <TableRowGroup key={event.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleExpand(event.id)}
                        >
                          <TableCell className="px-2">
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(event.createdAt), 'dd MMM yyyy HH:mm:ss', { locale: it })}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-medium ${badgeConfig.className}`}>
                              {ACTION_LABELS[event.action] ?? event.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {event.userLabel ?? (
                              <span className="text-muted-foreground italic">Sistema</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="flex flex-col">
                              <span className="text-muted-foreground">
                                {event.resource ? (RESOURCE_LABELS[event.resource] ?? event.resource) : '-'}
                              </span>
                              {event.resourceLabel && (
                                <span className="text-[11px] text-muted-foreground/70 truncate max-w-[200px]">
                                  {event.resourceLabel}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {event.ipAddress ?? '-'}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={6} className="p-0">
                              <MetadataPanel event={event} />
                            </TableCell>
                          </TableRow>
                        )}
                      </TableRowGroup>
                    )
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-xs text-muted-foreground">
                  {total} {total === 1 ? 'evento' : 'eventi'} totali
                  {isFetching && !isLoading && (
                    <Loader2 className="inline h-3 w-3 animate-spin ml-2" />
                  )}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={page <= 1}
                    onClick={() => setFilters((f) => ({ ...f, page: 1 }))}
                  >
                    <ChevronsLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={page <= 1}
                    onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs px-2 text-muted-foreground">
                    Pagina {page} di {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={page >= totalPages}
                    onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={page >= totalPages}
                    onClick={() => setFilters((f) => ({ ...f, page: totalPages }))}
                  >
                    <ChevronsRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Helper: group table rows so expanded + main row stay together ────────────

function TableRowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
