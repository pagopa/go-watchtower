'use client'

import { useState, useMemo, useRef, useCallback, useEffect, Fragment } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { formatRelativeTimeFromDate, formatAbsoluteDateTime } from '@go-watchtower/shared'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  ExternalLink,
  Clock,
  Shield,
  User,
  Settings,
  Activity,
  Box,
  Search,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { DataTableHeader, useSort } from '@/components/data-table'
import { ColumnConfigurator } from '@/components/ui/column-configurator'
import { useColumnSettings } from '@/hooks/use-column-settings'
import { usePermissions } from '@/hooks/use-permissions'
import { COLUMN_REGISTRY } from '@/lib/column-registry'
import { api } from '@/lib/api-client'
import type { SystemEvent, SystemEventsFilters, UserDetail } from '@/lib/api-client'
import {
  SystemEventActions,
  SystemEventResources,
  SYSTEM_EVENT_RESOURCE_LABELS,
  SYSTEM_EVENT_ACTION_LABELS,
} from '@go-watchtower/shared'
import type { SystemEventAction, SystemEventResource } from '@go-watchtower/shared'

// ─── Column definitions ───────────────────────────────────────────────────────

const SYSTEM_EVENTS_COLUMNS = COLUMN_REGISTRY.systemEvents!

// ─── Action category config ───────────────────────────────────────────────────

interface ActionCategory {
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  borderColor: string
  bgColor: string
  textColor: string
  actions: string[]
}

const ACTION_CATEGORIES: ActionCategory[] = [
  {
    label: 'Autenticazione',
    icon: Shield,
    color: 'bg-blue-500',
    borderColor: 'border-l-blue-400',
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-700 dark:text-blue-400',
    actions: [
      SystemEventActions.USER_LOGIN,
      SystemEventActions.USER_LOGIN_GOOGLE,
      SystemEventActions.USER_LOGIN_FAILED,
      SystemEventActions.USER_LOGOUT,
      SystemEventActions.USER_TOKEN_REVOKED,
    ],
  },
  {
    label: 'Analisi',
    icon: Activity,
    color: 'bg-violet-500',
    borderColor: 'border-l-violet-400',
    bgColor: 'bg-violet-500/10',
    textColor: 'text-violet-700 dark:text-violet-400',
    actions: [
      SystemEventActions.ANALYSIS_CREATED,
      SystemEventActions.ANALYSIS_UPDATED,
      SystemEventActions.ANALYSIS_DELETED,
      SystemEventActions.ANALYSIS_STATUS_CHANGED,
    ],
  },
  {
    label: 'Utenti',
    icon: User,
    color: 'bg-sky-500',
    borderColor: 'border-l-sky-400',
    bgColor: 'bg-sky-500/10',
    textColor: 'text-sky-700 dark:text-sky-400',
    actions: [
      SystemEventActions.USER_CREATED,
      SystemEventActions.USER_UPDATED,
      SystemEventActions.USER_ACTIVATED,
      SystemEventActions.USER_DEACTIVATED,
      SystemEventActions.USER_DELETED,
      SystemEventActions.USER_PASSWORD_CHANGED,
      SystemEventActions.USER_ROLE_CHANGED,
      SystemEventActions.PERMISSION_OVERRIDE_CREATED,
      SystemEventActions.PERMISSION_OVERRIDE_UPDATED,
      SystemEventActions.PERMISSION_OVERRIDE_DELETED,
    ],
  },
  {
    label: 'Configurazione',
    icon: Box,
    color: 'bg-teal-500',
    borderColor: 'border-l-teal-400',
    bgColor: 'bg-teal-500/10',
    textColor: 'text-teal-700 dark:text-teal-400',
    actions: [
      SystemEventActions.PRODUCT_CREATED,
      SystemEventActions.PRODUCT_UPDATED,
      SystemEventActions.PRODUCT_DELETED,
      SystemEventActions.ENVIRONMENT_CREATED,
      SystemEventActions.ENVIRONMENT_UPDATED,
      SystemEventActions.ENVIRONMENT_DELETED,
      SystemEventActions.RESOURCE_CREATED,
      SystemEventActions.RESOURCE_UPDATED,
      SystemEventActions.RESOURCE_DELETED,
      SystemEventActions.RUNBOOK_CREATED,
      SystemEventActions.RUNBOOK_UPDATED,
      SystemEventActions.RUNBOOK_DELETED,
      SystemEventActions.FINAL_ACTION_CREATED,
      SystemEventActions.FINAL_ACTION_UPDATED,
      SystemEventActions.FINAL_ACTION_DELETED,
      SystemEventActions.ALARM_CREATED,
      SystemEventActions.ALARM_UPDATED,
      SystemEventActions.ALARM_DELETED,
      SystemEventActions.DOWNSTREAM_CREATED,
      SystemEventActions.DOWNSTREAM_UPDATED,
      SystemEventActions.DOWNSTREAM_DELETED,
      SystemEventActions.IGNORED_ALARM_CREATED,
      SystemEventActions.IGNORED_ALARM_UPDATED,
      SystemEventActions.IGNORED_ALARM_DELETED,
      SystemEventActions.IGNORE_REASON_CREATED,
      SystemEventActions.IGNORE_REASON_UPDATED,
      SystemEventActions.IGNORE_REASON_DELETED,
    ],
  },
  {
    label: 'Ruoli & Sistema',
    icon: Settings,
    color: 'bg-orange-500',
    borderColor: 'border-l-orange-400',
    bgColor: 'bg-orange-500/10',
    textColor: 'text-orange-700 dark:text-orange-400',
    actions: [
      SystemEventActions.ROLE_CREATED,
      SystemEventActions.ROLE_UPDATED,
      SystemEventActions.ROLE_DELETED,
      SystemEventActions.ROLE_PERMISSIONS_UPDATED,
      SystemEventActions.SETTING_UPDATED,
    ],
  },
]

const ACTION_TO_CATEGORY = new Map<string, ActionCategory>()
for (const cat of ACTION_CATEGORIES) {
  for (const action of cat.actions) {
    ACTION_TO_CATEGORY.set(action, cat)
  }
}

const FALLBACK_CATEGORY: ActionCategory = {
  label: 'Altro',
  icon: Activity,
  color: 'bg-muted-foreground',
  borderColor: 'border-l-muted-foreground/40',
  bgColor: 'bg-muted',
  textColor: 'text-muted-foreground',
  actions: [],
}

function getCategoryForAction(action: string): ActionCategory {
  return ACTION_TO_CATEGORY.get(action) ?? FALLBACK_CATEGORY
}

// ─── Metadata helpers ─────────────────────────────────────────────────────────

/** Safely access a nested property from Record<string, unknown> metadata. */
function metaGet(metadata: Record<string, unknown>, ...path: string[]): unknown {
  let current: unknown = metadata
  for (const key of path) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/** Extract productId from various metadata shapes (direct, created, diff, before/after). */
function metaProductId(metadata: Record<string, unknown>): string | null {
  const candidate =
    metaGet(metadata, 'productId') ??
    metaGet(metadata, 'created', 'productId') ??
    metaGet(metadata, 'after', 'productId') ??
    metaGet(metadata, 'before', 'productId') ??
    null
  return typeof candidate === 'string' ? candidate : null
}

// ─── Resource link resolver ───────────────────────────────────────────────────

function resolveResourceLink(event: SystemEvent): string | null {
  const { resource, resourceId, metadata } = event
  if (!resourceId) return null

  switch (resource) {
    case SystemEventResources.USERS:
      return `/users/${resourceId}`

    case SystemEventResources.PRODUCTS:
      return `/products/${resourceId}`

    case SystemEventResources.ALARM_ANALYSES: {
      const productId = metaProductId(metadata)
      if (productId && resourceId) return `/analyses?productId=${productId}&analysisId=${resourceId}`
      return productId ? `/analyses?productId=${productId}` : '/analyses'
    }

    case SystemEventResources.ENVIRONMENTS:
    case SystemEventResources.ALARMS:
    case SystemEventResources.RESOURCES:
    case SystemEventResources.RUNBOOKS:
    case SystemEventResources.FINAL_ACTIONS:
    case SystemEventResources.DOWNSTREAMS:
    case SystemEventResources.IGNORED_ALARMS: {
      const productId = metaProductId(metadata)
      if (!productId) return null
      const tabMap: Record<string, string> = {
        [SystemEventResources.ENVIRONMENTS]: 'environments',
        [SystemEventResources.RESOURCES]: 'resources',
        [SystemEventResources.RUNBOOKS]: 'runbooks',
        [SystemEventResources.ALARMS]: 'alarms',
        [SystemEventResources.DOWNSTREAMS]: 'downstreams',
        [SystemEventResources.FINAL_ACTIONS]: 'final-actions',
        [SystemEventResources.IGNORED_ALARMS]: 'ignored-alarms',
      }
      const tab = resource ? tabMap[resource] : undefined
      return tab ? `/products/${productId}?tab=${tab}` : `/products/${productId}`
    }

    default:
      return null
  }
}

// ─── Relative time ────────────────────────────────────────────────────────────

function RelativeTime({ dateStr }: { dateStr: string }) {
  const date = new Date(dateStr)
  const relative = formatRelativeTimeFromDate(date)
  const absolute = formatAbsoluteDateTime(date)

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default tabular-nums text-sm text-muted-foreground whitespace-nowrap hover:text-foreground transition-colors">
            {relative}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="font-mono text-xs">
          {absolute}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ─── Action badge ─────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const cat = getCategoryForAction(action)
  const label = SYSTEM_EVENT_ACTION_LABELS[action as SystemEventAction] ?? action

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${cat.bgColor} ${cat.textColor}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cat.color}`} />
      {label}
    </span>
  )
}

// ─── Resource cell ────────────────────────────────────────────────────────────

function ResourceCell({ event }: { event: SystemEvent }) {
  const link = resolveResourceLink(event)

  return (
    <div className="space-y-0.5 min-w-0">
      {event.resource && (
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 block">
          {SYSTEM_EVENT_RESOURCE_LABELS[event.resource as SystemEventResource] ?? event.resource}
        </span>
      )}
      {event.resourceLabel && (
        link ? (
          <Link
            href={link}
            className="text-sm font-medium text-primary hover:underline flex items-center gap-1 min-w-0"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="truncate">{event.resourceLabel}</span>
            <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
          </Link>
        ) : (
          <span className="text-sm text-foreground/80 truncate block">{event.resourceLabel}</span>
        )
      )}
      {!event.resourceLabel && !event.resource && (
        <span className="text-sm text-muted-foreground/40">—</span>
      )}
    </div>
  )
}

// ─── Row cell component ──────────────────────────────────────────────────────

function SystemEventCell({ columnId, event }: { columnId: string; event: SystemEvent }) {
  switch (columnId) {
    case 'quando':
      return <RelativeTime dateStr={event.createdAt} />
    case 'azione':
      return <ActionBadge action={event.action} />
    case 'risorsa':
      return <ResourceCell event={event} />
    case 'utente':
      return event.userLabel
        ? <span className="text-sm truncate block">{event.userLabel}</span>
        : <span className="text-sm italic text-muted-foreground/50">Sistema</span>
    case 'ip':
      return <span className="text-sm font-mono text-muted-foreground">{event.ipAddress ?? '—'}</span>
    default:
      return null
  }
}

// ─── Metadata panel ───────────────────────────────────────────────────────────

function MetadataPanel({ event }: { event: SystemEvent }) {
  const [jsonOpen, setJsonOpen] = useState(false)
  const meta = event.metadata
  const hasDiff = metaGet(meta, 'diff') !== undefined
  const hasBefore = metaGet(meta, 'before') !== undefined
  const hasAfter = metaGet(meta, 'after') !== undefined
  const hasAnyMeta = Object.keys(meta).length > 0

  const link = resolveResourceLink(event)

  return (
    <div className="border-t bg-muted/20 px-4 py-4 space-y-4 text-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded border bg-background px-3 py-2.5 space-y-1">
          <p className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">ID Evento</p>
          <p className="font-mono text-xs break-all select-all leading-relaxed">{event.id}</p>
        </div>

        <div className="rounded border bg-background px-3 py-2.5 space-y-1">
          <p className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">ID Risorsa</p>
          {event.resourceId ? (
            link ? (
              <Link
                href={link}
                className="font-mono text-xs break-all text-primary hover:underline inline-flex items-center gap-1 leading-relaxed"
              >
                {event.resourceId}
                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
              </Link>
            ) : (
              <p className="font-mono text-xs break-all select-all leading-relaxed">{event.resourceId}</p>
            )
          ) : (
            <p className="text-muted-foreground italic">—</p>
          )}
        </div>

        <div className="rounded border bg-background px-3 py-2.5 space-y-1">
          <p className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">IP Address</p>
          <p className="font-mono text-xs">{event.ipAddress ?? '—'}</p>
        </div>

        <div className="rounded border bg-background px-3 py-2.5 space-y-1">
          <p className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">User Agent</p>
          <p className="text-xs break-words leading-relaxed">{event.userAgent ?? '—'}</p>
        </div>
      </div>

      {hasAnyMeta && (hasDiff || (hasBefore && hasAfter)) && (
        <div className="space-y-1.5">
          <p className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">Modifiche</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">Prima</p>
              <pre className="rounded border border-red-200/60 bg-red-500/5 p-2.5 font-mono text-xs overflow-x-auto dark:border-red-800/40">
                {JSON.stringify(hasDiff ? metaGet(meta, 'diff', 'before') : metaGet(meta, 'before'), null, 2)}
              </pre>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Dopo</p>
              <pre className="rounded border border-emerald-200/60 bg-emerald-500/5 p-2.5 font-mono text-xs overflow-x-auto dark:border-emerald-800/40">
                {JSON.stringify(hasDiff ? metaGet(meta, 'diff', 'after') : metaGet(meta, 'after'), null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {hasAnyMeta && (
        <div>
          <button
            type="button"
            onClick={() => setJsonOpen((o) => !o)}
            className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground uppercase tracking-wider transition-colors"
          >
            {jsonOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            JSON completo
          </button>
          {jsonOpen && (
            <pre className="mt-1.5 rounded border bg-muted p-3 font-mono text-xs overflow-x-auto">
              {JSON.stringify(meta, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Action multiselect (grouped, with click-outside fix) ─────────────────────

function ActionMultiSelect({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (values: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Close when clicking outside the component
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (action: string) => {
    onChange(
      selected.includes(action)
        ? selected.filter((a) => a !== action)
        : [...selected, action]
    )
  }

  const toggleCategory = (cat: ActionCategory) => {
    const allSelected = cat.actions.every((a) => selected.includes(a))
    if (allSelected) {
      onChange(selected.filter((a) => !cat.actions.includes(a)))
    } else {
      const toAdd = cat.actions.filter((a) => !selected.includes(a))
      onChange([...selected, ...toAdd])
    }
  }

  const filteredCategories = useMemo(() => {
    if (!search) return ACTION_CATEGORIES
    const q = search.toLowerCase()
    return ACTION_CATEGORIES
      .map((cat) => ({
        ...cat,
        actions: cat.actions.filter((a) => {
          const label = SYSTEM_EVENT_ACTION_LABELS[a as SystemEventAction] ?? a
          return label.toLowerCase().includes(q) || a.toLowerCase().includes(q)
        }),
      }))
      .filter((cat) => cat.actions.length > 0)
  }, [search])

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate text-muted-foreground">
          {selected.length === 0
            ? 'Tutte le azioni'
            : `${selected.length} ${selected.length === 1 ? 'azione' : 'azioni'}`}
        </span>
        {selected.length > 0 ? (
          <span className="ml-1.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
            {selected.length}
          </span>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-80 rounded-lg border bg-popover shadow-xl">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtra azioni..."
                className="w-full rounded-sm border-0 bg-muted/50 py-1.5 pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-1">
            {selected.length > 0 && !search && (
              <button
                className="w-full rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                onClick={() => onChange([])}
              >
                Deseleziona tutto ({selected.length})
              </button>
            )}

            {filteredCategories.map((cat) => {
              const CatIcon = cat.icon
              const allCatSelected = cat.actions.every((a) => selected.includes(a))
              const someCatSelected = cat.actions.some((a) => selected.includes(a))

              return (
                <div key={cat.label} className="mt-1 first:mt-0">
                  <button
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent transition-colors"
                    onClick={() => toggleCategory(cat)}
                  >
                    <div
                      className={cn(
                        'h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition-colors',
                        allCatSelected
                          ? 'bg-primary border-primary'
                          : someCatSelected
                          ? 'border-primary bg-primary/20'
                          : 'border-muted-foreground/30'
                      )}
                    >
                      {allCatSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                      {someCatSelected && !allCatSelected && (
                        <span className="h-1.5 w-1.5 rounded-sm bg-primary" />
                      )}
                    </div>
                    <CatIcon className={`h-3.5 w-3.5 shrink-0 ${cat.textColor}`} />
                    <span className="text-sm font-medium">{cat.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{cat.actions.length}</span>
                  </button>

                  <div className="ml-4 space-y-0.5">
                    {cat.actions.map((action) => {
                      const isSelected = selected.includes(action)
                      const label = SYSTEM_EVENT_ACTION_LABELS[action as SystemEventAction] ?? action
                      return (
                        <button
                          key={action}
                          className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent transition-colors"
                          onClick={() => toggle(action)}
                        >
                          <div
                            className={cn(
                              'h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition-colors',
                              isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                            )}
                          >
                            {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                          </div>
                          <span className="text-sm">{label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SystemEventsPage() {
  const { can } = usePermissions()

  // Column settings (saved to user profile)
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
  } = useColumnSettings('systemEvents', SYSTEM_EVENTS_COLUMNS)

  // Users list for filter dropdown
  const { data: users } = useQuery<UserDetail[]>({
    queryKey: ['users'],
    queryFn: api.getUsers,
    enabled: can('USER', 'read'),
  })

  const allResources = useMemo(() => Object.values(SystemEventResources), [])

  const [filters, setFilters] = useState<Omit<SystemEventsFilters, 'page' | 'limit' | 'sortBy' | 'sortOrder'>>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const { sortBy, sortOrder, handleSort } = useSort('createdAt')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['system-events', filters, page, pageSize, sortBy, sortOrder],
    queryFn: () => api.getSystemEvents({ ...filters, page, limit: pageSize, sortBy, sortOrder }),
    placeholderData: (prev) => prev,
    staleTime: 0,
  })

  const events = data?.data ?? []
  const total = data?.total ?? 0
  const currentPage = data?.page ?? 1
  const totalPages = data?.totalPages ?? 1

  // Min-width for horizontal scroll (same pattern as analyses page)
  const totalTableMinWidth = useMemo(() => {
    if (visibleColumns.length === 0) return 600
    const lastIdx = visibleColumns.length - 1
    const nonLastSum = visibleColumns
      .slice(0, lastIdx)
      .reduce((sum, col) => sum + (getWidth(col.id) ?? col.defaultWidth ?? 150), 0)
    const lastDataCol = visibleColumns[lastIdx]
    const lastColMin = lastDataCol
      ? (getWidth(lastDataCol.id) ?? lastDataCol.defaultWidth ?? lastDataCol.minWidth ?? 100)
      : 100
    return nonLastSum + lastColMin + 44 // 44px for expand toggle column
  }, [visibleColumns, getWidth])

  const toggleExpand = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const updateFilters = (patch: Partial<Omit<SystemEventsFilters, 'page' | 'limit' | 'sortBy' | 'sortOrder'>>) => {
    setFilters((prev) => ({ ...prev, ...patch }))
    setPage(1)
  }

  const clearFilters = () => {
    setFilters({})
    setPage(1)
    setPageSize(50)
    setExpandedRows(new Set())
  }


  const hasActiveFilters = Boolean(
    (filters.action && filters.action.length > 0) ||
    filters.resource ||
    filters.userId ||
    filters.dateFrom ||
    filters.dateTo
  )

  const activeFilterCount =
    (filters.action?.length ? 1 : 0) +
    (filters.resource ? 1 : 0) +
    (filters.userId ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0)

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Log eventi</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Registro di audit immutabile — tutte le azioni eseguite nel sistema
          </p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          {isFetching && !isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {total > 0 && (
            <span className="text-sm text-muted-foreground tabular-nums">
              <span className="font-medium text-foreground">{total.toLocaleString('it')}</span> eventi
            </span>
          )}
          <ColumnConfigurator
            allColumns={allColumns}
            isVisible={isVisible}
            toggleColumn={toggleColumn}
            moveColumn={moveColumn}
            renameColumn={renameColumn}
            resetColumns={resetColumns}
          />
        </div>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <span className="text-sm font-medium text-muted-foreground">Filtri</span>
          {hasActiveFilters && (
            <>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                {activeFilterCount}
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="ml-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Pulisci filtri
              </button>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* Action multiselect */}
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">Azione</Label>
            <ActionMultiSelect
              selected={filters.action ?? []}
              onChange={(action) => updateFilters({ action: action.length ? action : undefined })}
            />
          </div>

          {/* Resource */}
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">Risorsa</Label>
            <Select
              value={filters.resource ?? '__all__'}
              onValueChange={(v) => updateFilters({ resource: v === '__all__' ? undefined : v })}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Tutte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tutte le risorse</SelectItem>
                {allResources.map((r) => (
                  <SelectItem key={r} value={r}>
                    {SYSTEM_EVENT_RESOURCE_LABELS[r as SystemEventResource] ?? r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* User — dropdown instead of text input */}
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">Utente</Label>
            <Select
              value={filters.userId ?? '__all__'}
              onValueChange={(v) => updateFilters({ userId: v === '__all__' ? undefined : v })}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Tutti gli utenti" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tutti gli utenti</SelectItem>
                {users?.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date from */}
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">Da</Label>
            <DateTimePicker
              value={filters.dateFrom ?? ''}
              onChange={(v) => updateFilters({ dateFrom: v || undefined })}
            />
          </div>

          {/* Date to */}
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">A</Label>
            <DateTimePicker
              value={filters.dateTo ?? ''}
              onChange={(v) => updateFilters({ dateTo: v || undefined })}
            />
          </div>
        </div>

        {/* Quick category presets */}
        <div className="flex flex-wrap items-center gap-1.5 border-t px-4 py-2.5">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground mr-1">Scorciatoie:</span>
          {ACTION_CATEGORIES.map((cat) => {
            const CatIcon = cat.icon
            const isActive =
              cat.actions.every((a) => filters.action?.includes(a)) &&
              filters.action?.length === cat.actions.length
            return (
              <button
                key={cat.label}
                type="button"
                onClick={() => {
                  if (isActive) {
                    updateFilters({ action: undefined })
                  } else {
                    updateFilters({ action: cat.actions })
                  }
                }}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all',
                  isActive
                    ? `${cat.bgColor} ${cat.textColor} border-transparent`
                    : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                )}
              >
                <CatIcon className="h-3 w-3" />
                {cat.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Events table ───────────────────────────────────────────────────── */}
      <div className="rounded-lg border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Clock className="h-8 w-8 mb-3 opacity-30" />
            <p className="text-sm font-medium">Nessun evento trovato</p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-2 text-sm text-primary hover:underline"
              >
                Rimuovi i filtri attivi
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
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
                  hasActions
                  actionsWidth={44}
                  actionsLabel="Espandi"
                />

                <TableBody>
                  {events.map((event) => {
                    const isExpanded = expandedRows.has(event.id)
                    const cat = getCategoryForAction(event.action)

                    return (
                      <Fragment key={event.id}>
                        <TableRow
                          className={cn(
                            'border-l-4 cursor-pointer transition-colors',
                            cat.borderColor,
                            isExpanded ? 'bg-muted/30 hover:bg-muted/40' : 'hover:bg-muted/40'
                          )}
                          onClick={() => toggleExpand(event.id)}
                        >
                          {visibleColumns.map((col) => (
                            <TableCell key={col.id} className="py-3 overflow-hidden">
                              <SystemEventCell columnId={col.id} event={event} />
                            </TableCell>
                          ))}
                          <TableCell className="py-3 w-11 text-center">
                            {isExpanded
                              ? <ChevronUp className="h-4 w-4 text-muted-foreground/60 mx-auto" />
                              : <ChevronDown className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                            }
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow
                            className={cn('border-l-4 hover:bg-transparent', cat.borderColor)}
                          >
                            <TableCell colSpan={visibleColumns.length + 1} className="p-0">
                              <MetadataPanel event={event} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t px-4 py-3 bg-muted/10">
              <div className="flex items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  Pagina <span className="font-medium text-foreground tabular-nums">{currentPage}</span>
                  {' '}di{' '}
                  <span className="font-medium text-foreground tabular-nums">{totalPages}</span>
                </p>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}
                >
                  <SelectTrigger className="h-8 w-28 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 / pag.</SelectItem>
                    <SelectItem value="50">50 / pag.</SelectItem>
                    <SelectItem value="100">100 / pag.</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(1)}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(totalPages)}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
