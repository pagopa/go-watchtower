'use client'

import { useState, useMemo } from 'react'
import { Search, X, ChevronDown, SlidersHorizontal, Settings2 } from 'lucide-react'
import { formatJsDate, subDays, startOfMonth } from '@go-watchtower/shared'
import type { DateRange } from 'react-day-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DateRangePicker, type DateRangePreset } from '@/components/ui/date-range-picker'
import { Button } from '@/components/ui/button'
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox'
import { useDebouncedInput } from '@/hooks/use-debounced-input'
import type {
  Environment,
  Alarm,
  FinalAction,
  AnalysisAuthor,
  AnalysisType,
  AnalysisStatus,
  IgnoreReason,
  ProductResource,
  Downstream,
  Runbook,
  AlertPriorityLevel,
} from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { ANALYSIS_TYPE_LABELS, ANALYSIS_STATUS_LABELS } from '../_lib/constants'

export interface AnalysisFiltersState {
  search: string
  analysisTypes: string[]
  statuses: string[]
  environmentIds: string[]
  operatorIds: string[]
  alarmIds: string[]
  finalActionIds: string[]
  priorityCodes: string[]
  isOnCall: boolean | undefined
  dateFrom: string
  dateTo: string
  // Advanced filters
  ignoreReasonCodes: string[]
  runbookIds: string[]
  resourceIds: string[]
  downstreamIds: string[]
  linkTypes: string[]
  traceId: string
}

interface AnalysisFiltersProps {
  filters: AnalysisFiltersState
  onFilterChange: (filters: AnalysisFiltersState) => void
  onReset: () => void
  environments: Environment[] | undefined
  alarms: Alarm[] | undefined
  finalActions: FinalAction[] | undefined
  priorityLevels: AlertPriorityLevel[] | undefined
  users: AnalysisAuthor[] | undefined
  ignoreReasons: IgnoreReason[] | undefined
  resources: ProductResource[] | undefined
  downstreams: Downstream[] | undefined
  runbooks: Runbook[] | undefined
  linkTypes: string[] | undefined
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function filtersToRange(dateFrom: string, dateTo: string): DateRange | undefined {
  if (!dateFrom && !dateTo) return undefined
  return {
    from: dateFrom ? new Date(dateFrom) : undefined,
    to: dateTo ? new Date(dateTo) : undefined,
  }
}

function rangeToFilters(range: DateRange | undefined): { dateFrom: string; dateTo: string } {
  if (!range?.from) return { dateFrom: '', dateTo: '' }
  const dateFrom = formatJsDate(range.from, "yyyy-MM-dd'T'00:00")
  const dateTo = range.to ? formatJsDate(range.to, "yyyy-MM-dd'T'23:59") : ''
  return { dateFrom, dateTo }
}

function sod(d: Date): Date { d.setHours(0, 0, 0, 0); return d }
function eod(d: Date): Date { d.setHours(23, 59, 59, 999); return d }

const DATE_PRESETS: DateRangePreset[] = [
  { label: 'Oggi',      range: () => ({ from: sod(new Date()), to: eod(new Date()) }) },
  { label: 'Ieri',      range: () => ({ from: sod(subDays(new Date(), 1)), to: eod(subDays(new Date(), 1)) }) },
  { label: '7 giorni',  range: () => ({ from: sod(subDays(new Date(), 6)), to: eod(new Date()) }) },
  { label: '30 giorni', range: () => ({ from: sod(subDays(new Date(), 29)), to: eod(new Date()) }) },
  { label: 'Mese',      range: () => ({ from: startOfMonth(new Date()), to: eod(new Date()) }) },
]

// ─── Active filter chips (collapsed header) ──────────────────────────────────

interface FilterChip {
  key: string
  label: string
}

function buildActiveChips(
  filters: AnalysisFiltersState,
  environments: Environment[] | undefined,
  alarms: Alarm[] | undefined,
  finalActions: FinalAction[] | undefined,
  priorityLevels: AlertPriorityLevel[] | undefined,
  users: AnalysisAuthor[] | undefined,
  ignoreReasons: IgnoreReason[] | undefined,
  _runbooks: Runbook[] | undefined,
  _resources: ProductResource[] | undefined,
  _downstreams: Downstream[] | undefined,
): FilterChip[] {
  const chips: FilterChip[] = []

  // Environments
  if (filters.environmentIds.length > 0) {
    if (filters.environmentIds.length <= 2 && environments) {
      for (const id of filters.environmentIds) {
        const env = environments.find((e) => e.id === id)
        chips.push({ key: `env:${id}`, label: env?.name ?? id })
      }
    } else {
      chips.push({ key: 'env', label: `${filters.environmentIds.length} ambienti` })
    }
  }

  // Date range
  if (filters.dateFrom || filters.dateTo) {
    if (filters.dateFrom && filters.dateTo) {
      chips.push({
        key: 'date',
        label: `${formatJsDate(new Date(filters.dateFrom), 'dd MMM')} – ${formatJsDate(new Date(filters.dateTo), 'dd MMM')}`,
      })
    } else if (filters.dateFrom) {
      chips.push({ key: 'date', label: `Da ${formatJsDate(new Date(filters.dateFrom), 'dd MMM')}` })
    }
  }

  // Alarms
  if (filters.alarmIds.length > 0) {
    if (filters.alarmIds.length <= 2 && alarms) {
      for (const id of filters.alarmIds) {
        const alarm = alarms.find((a) => a.id === id)
        const name = alarm?.name ?? id
        chips.push({ key: `alarm:${id}`, label: name.length > 20 ? name.slice(0, 20) + '\u2026' : name })
      }
    } else {
      chips.push({ key: 'alarm', label: `${filters.alarmIds.length} allarmi` })
    }
  }

  // Analysis types
  if (filters.analysisTypes.length > 0) {
    const labels = filters.analysisTypes.map((t) => ANALYSIS_TYPE_LABELS[t as AnalysisType] ?? t)
    chips.push({ key: 'type', label: labels.join(', ') })
  }

  // Statuses
  if (filters.statuses.length > 0) {
    const labels = filters.statuses.map((s) => ANALYSIS_STATUS_LABELS[s as AnalysisStatus] ?? s)
    chips.push({ key: 'status', label: labels.join(', ') })
  }

  // Final actions
  if (filters.finalActionIds.length > 0) {
    if (filters.finalActionIds.length === 1 && finalActions) {
      const fa = finalActions.find((f) => f.id === filters.finalActionIds[0])
      chips.push({ key: 'fa', label: fa?.name ?? filters.finalActionIds[0] })
    } else {
      chips.push({ key: 'fa', label: `${filters.finalActionIds.length} azioni finali` })
    }
  }

  if (filters.priorityCodes.length > 0) {
    if (filters.priorityCodes.length <= 2 && priorityLevels) {
      for (const code of filters.priorityCodes) {
        const level = priorityLevels.find((item) => item.code === code)
        chips.push({ key: `priority:${code}`, label: level?.label ?? code })
      }
    } else {
      chips.push({ key: 'priority', label: `${filters.priorityCodes.length} priority` })
    }
  }

  // On-call
  if (filters.isOnCall !== undefined) {
    chips.push({ key: 'oncall', label: 'Reperibilità' })
  }

  // Operators
  if (filters.operatorIds.length > 0) {
    if (filters.operatorIds.length === 1 && users) {
      const u = users.find((u) => u.id === filters.operatorIds[0])
      chips.push({ key: 'operator', label: u?.name ?? filters.operatorIds[0] })
    } else {
      chips.push({ key: 'operator', label: `${filters.operatorIds.length} operatori` })
    }
  }

  // Search
  if (filters.search) {
    const s = filters.search.length > 18 ? filters.search.slice(0, 18) + '\u2026' : filters.search
    chips.push({ key: 'search', label: s })
  }

  // Advanced
  if (filters.ignoreReasonCodes.length > 0) {
    if (filters.ignoreReasonCodes.length === 1 && ignoreReasons) {
      const r = ignoreReasons.find((r) => r.code === filters.ignoreReasonCodes[0])
      chips.push({ key: 'ignore', label: r?.label ?? filters.ignoreReasonCodes[0] })
    } else {
      chips.push({ key: 'ignore', label: `${filters.ignoreReasonCodes.length} motivi ignore` })
    }
  }
  if (filters.runbookIds.length > 0) chips.push({ key: 'runbook', label: `${filters.runbookIds.length} runbook` })
  if (filters.resourceIds.length > 0) chips.push({ key: 'resource', label: `${filters.resourceIds.length} risorse` })
  if (filters.downstreamIds.length > 0) chips.push({ key: 'downstream', label: `${filters.downstreamIds.length} downstream` })
  if (filters.linkTypes.length > 0) {
    if (filters.linkTypes.length <= 2) {
      for (const type of filters.linkTypes) {
        chips.push({ key: `linkType:${type}`, label: type })
      }
    } else {
      chips.push({ key: 'linkType', label: `${filters.linkTypes.length} tipi link` })
    }
  }
  if (filters.traceId) chips.push({ key: 'trace', label: `Trace: ${filters.traceId.slice(0, 12)}\u2026` })

  return chips
}

// ─── On-call toggle options ──────────────────────────────────────────────────

const ONCALL_OPTIONS = [
  { value: 'all' as const, label: 'Tutti' },
  { value: 'yes' as const, label: 'Sì' },
  { value: 'no' as const, label: 'No' },
]

function onCallToSegment(v: boolean | undefined): 'all' | 'yes' | 'no' {
  if (v === true) return 'yes'
  if (v === false) return 'no'
  return 'all'
}

function segmentToOnCall(v: 'all' | 'yes' | 'no'): boolean | undefined {
  if (v === 'yes') return true
  if (v === 'no') return false
  return undefined
}

type UpdateAnalysisFilter = <K extends keyof AnalysisFiltersState>(key: K, value: AnalysisFiltersState[K]) => void
type DebouncedInputState = ReturnType<typeof useDebouncedInput>

function AnalysisFiltersHeader({
  collapsed,
  activeFilterCount,
  activeChips,
  onToggle,
  onRemoveChip,
  onReset,
}: {
  collapsed: boolean
  activeFilterCount: number
  activeChips: FilterChip[]
  onToggle: (() => void) | undefined
  onRemoveChip: (key: string) => void
  onReset: () => void
}) {
  return (
    <div
      className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex shrink-0 items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
        <span>Filtri</span>
        {activeFilterCount > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">{activeFilterCount}</span>
        )}
      </button>
      {collapsed && activeChips.length > 0 && (
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {activeChips.map((chip) => (
            <button
              type="button"
              key={chip.key}
              onClick={() => onRemoveChip(chip.key)}
              aria-label={`Rimuovi filtro ${chip.label}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              <span className="max-w-[200px] truncate">{chip.label}</span>
              <X className="h-3 w-3 shrink-0 opacity-60 transition-opacity hover:text-foreground hover:opacity-100" />
            </button>
          ))}
        </div>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {collapsed && activeFilterCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            aria-label="Pulisci filtri"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="Pulisci filtri"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Espandi filtri' : 'Comprimi filtri'}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full"
        >
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', !collapsed && 'rotate-180')} />
        </button>
      </div>
    </div>
  )
}

function BasicAnalysisFilters({
  filters,
  environments,
  alarms,
  finalActions,
  priorityLevels,
  users,
  dateRange,
  search,
  onUpdate,
  onDateRangeChange,
}: Pick<AnalysisFiltersProps, 'filters' | 'environments' | 'alarms' | 'finalActions' | 'priorityLevels' | 'users'> & {
  dateRange: DateRange | undefined
  search: DebouncedInputState
  onUpdate: UpdateAnalysisFilter
  onDateRangeChange: (range: DateRange | undefined) => void
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {environments && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Ambiente</Label>
            <MultiSelectCombobox
              showTags={false}
              options={environments.map((environment) => ({ value: environment.id, label: environment.name }))}
              value={filters.environmentIds}
              onValueChange={(ids) => onUpdate('environmentIds', ids)}
              placeholder="Tutti gli ambienti"
              searchPlaceholder="Cerca ambiente..."
              emptyMessage="Nessun ambiente trovato."
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Periodo</Label>
          <DateRangePicker value={dateRange} onChange={onDateRangeChange} presets={DATE_PRESETS} className="w-full" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {alarms && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Allarme</Label>
            <MultiSelectCombobox
              showTags={false}
              options={alarms.map((alarm) => ({ value: alarm.id, label: alarm.name }))}
              value={filters.alarmIds}
              onValueChange={(ids) => onUpdate('alarmIds', ids)}
              placeholder="Tutti gli allarmi"
              searchPlaceholder="Cerca allarme..."
              emptyMessage="Nessun allarme trovato."
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Tipo analisi</Label>
          <MultiSelectCombobox
            showTags={false}
            options={(Object.keys(ANALYSIS_TYPE_LABELS) as AnalysisType[]).map((type) => ({ value: type, label: ANALYSIS_TYPE_LABELS[type] }))}
            value={filters.analysisTypes}
            onValueChange={(values) => onUpdate('analysisTypes', values)}
            placeholder="Tutti i tipi"
            searchPlaceholder="Cerca tipo..."
            emptyMessage="Nessun tipo trovato."
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Stato analisi</Label>
          <MultiSelectCombobox
            showTags={false}
            options={(Object.keys(ANALYSIS_STATUS_LABELS) as AnalysisStatus[]).map((status) => ({ value: status, label: ANALYSIS_STATUS_LABELS[status] }))}
            value={filters.statuses}
            onValueChange={(values) => onUpdate('statuses', values)}
            placeholder="Tutti gli stati"
            searchPlaceholder="Cerca stato..."
            emptyMessage="Nessuno stato trovato."
          />
        </div>
        {finalActions && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Azione finale</Label>
            <MultiSelectCombobox
              showTags={false}
              options={finalActions.map((action) => ({ value: action.id, label: action.name }))}
              value={filters.finalActionIds}
              onValueChange={(ids) => onUpdate('finalActionIds', ids)}
              placeholder="Tutte le azioni"
              searchPlaceholder="Cerca azione..."
              emptyMessage="Nessuna azione trovata."
            />
          </div>
        )}
        {priorityLevels && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Priority</Label>
            <MultiSelectCombobox
              showTags={false}
              options={[...priorityLevels].filter((level) => level.isActive).sort((a, b) => b.rank - a.rank).map((level) => ({ value: level.code, label: level.label }))}
              value={filters.priorityCodes}
              onValueChange={(codes) => onUpdate('priorityCodes', codes)}
              placeholder="Tutte le priority"
              searchPlaceholder="Cerca priority..."
              emptyMessage="Nessuna priority trovata."
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Operatore</Label>
          <MultiSelectCombobox
            showTags={false}
            options={(users ?? []).map((user) => ({ value: user.id, label: user.name }))}
            value={filters.operatorIds}
            onValueChange={(ids) => onUpdate('operatorIds', ids)}
            placeholder="Tutti gli operatori"
            searchPlaceholder="Cerca operatore..."
            emptyMessage="Nessun operatore trovato."
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Reperibilità</Label>
          <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 p-0.5">
            {ONCALL_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onUpdate('isOnCall', segmentToOnCall(option.value))}
                className={cn(
                  'flex-1 rounded-[5px] px-2 py-1 text-xs font-medium transition-all',
                  onCallToSegment(filters.isOnCall) === option.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-search" className="text-xs text-muted-foreground">Ricerca</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input id="filter-search" placeholder="Cerca nei dettagli e tracking ID..." value={search.value} onChange={(event) => search.onChange(event.target.value)} className="pl-8 text-sm" />
          </div>
        </div>
      </div>
    </>
  )
}

function AdvancedAnalysisFilters({
  filters,
  ignoreReasons,
  resources,
  downstreams,
  runbooks,
  linkTypes,
  traceId,
  onUpdate,
}: Pick<AnalysisFiltersProps, 'filters' | 'ignoreReasons' | 'resources' | 'downstreams' | 'runbooks' | 'linkTypes'> & {
  traceId: DebouncedInputState
  onUpdate: UpdateAnalysisFilter
}) {
  const hasAdvancedFilters = Boolean(
    filters.ignoreReasonCodes.length || filters.runbookIds.length || filters.resourceIds.length ||
    filters.downstreamIds.length || filters.linkTypes.length || filters.traceId,
  )
  const [manuallyOpen, setManuallyOpen] = useState(false)
  const open = hasAdvancedFilters || manuallyOpen
  const activeCount = [
    filters.ignoreReasonCodes.length, filters.runbookIds.length, filters.resourceIds.length,
    filters.downstreamIds.length, filters.linkTypes.length, filters.traceId,
  ].filter(Boolean).length
  const hasProductScopedFilters = Boolean(resources || downstreams || runbooks)

  return (
    <div className="border-t pt-3">
      <button
        type="button"
        onClick={() => setManuallyOpen((current) => !current)}
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span>Filtri avanzati</span>
        {activeCount > 0 && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">{activeCount}</span>
        )}
        <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-3 grid animate-in gap-4 fade-in slide-in-from-top-1 [animation-duration:150ms] sm:grid-cols-2 lg:grid-cols-4">
          {ignoreReasons && ignoreReasons.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Motivazione ignore</Label>
              <MultiSelectCombobox
                showTags={false}
                options={ignoreReasons.map((reason) => ({ value: reason.code, label: reason.label }))}
                value={filters.ignoreReasonCodes}
                onValueChange={(codes) => onUpdate('ignoreReasonCodes', codes)}
                placeholder="Tutte le motivazioni"
                searchPlaceholder="Cerca motivazione..."
                emptyMessage="Nessuna motivazione trovata."
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="filter-traceid" className="text-xs text-muted-foreground">ID Tracciamento</Label>
            <Input id="filter-traceid" placeholder="Cerca trace ID esatto..." value={traceId.value} onChange={(event) => traceId.onChange(event.target.value)} className="text-sm" />
          </div>
          {linkTypes && linkTypes.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tipo link</Label>
              <MultiSelectCombobox
                showTags={false}
                options={linkTypes.map((type) => ({ value: type, label: type }))}
                value={filters.linkTypes}
                onValueChange={(types) => onUpdate('linkTypes', types)}
                placeholder="Tutti i tipi link"
                searchPlaceholder="Cerca tipo link..."
                emptyMessage="Nessun tipo link trovato."
              />
            </div>
          )}
          {runbooks && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Runbook</Label>
              <MultiSelectCombobox showTags={false} options={runbooks.map((runbook) => ({ value: runbook.id, label: runbook.name }))} value={filters.runbookIds} onValueChange={(ids) => onUpdate('runbookIds', ids)} placeholder="Tutti i runbook" searchPlaceholder="Cerca runbook..." emptyMessage="Nessun runbook trovato." />
            </div>
          )}
          {resources && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Risorsa</Label>
              <MultiSelectCombobox showTags={false} options={resources.map((resource) => ({ value: resource.id, label: resource.name }))} value={filters.resourceIds} onValueChange={(ids) => onUpdate('resourceIds', ids)} placeholder="Tutte le risorse" searchPlaceholder="Cerca risorsa..." emptyMessage="Nessuna risorsa trovata." />
            </div>
          )}
          {downstreams && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Downstream</Label>
              <MultiSelectCombobox showTags={false} options={downstreams.map((downstream) => ({ value: downstream.id, label: downstream.name }))} value={filters.downstreamIds} onValueChange={(ids) => onUpdate('downstreamIds', ids)} placeholder="Tutti i downstream" searchPlaceholder="Cerca downstream..." emptyMessage="Nessun downstream trovato." />
            </div>
          )}
          {!hasProductScopedFilters && (
            <p className="col-span-full text-xs text-muted-foreground/60">Seleziona un prodotto per filtrare per risorsa, downstream e runbook.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function AnalysisFilters({
  filters,
  onFilterChange,
  onReset,
  environments,
  alarms,
  finalActions,
  priorityLevels,
  users,
  ignoreReasons,
  resources,
  downstreams,
  runbooks,
  linkTypes,
  collapsed = false,
  onToggleCollapsed,
}: AnalysisFiltersProps) {
  const updateFilter = <K extends keyof AnalysisFiltersState>(key: K, value: AnalysisFiltersState[K]) => {
    onFilterChange({ ...filters, [key]: value })
  }

  const search  = useDebouncedInput(filters.search, (v) => updateFilter('search', v))
  const traceId = useDebouncedInput(filters.traceId, (v) => updateFilter('traceId', v))

  const handleReset = () => {
    search.reset()
    traceId.reset()
    onReset()
  }

  const handleRemoveChip = (key: string) => {
    const updated = { ...filters }
    if (key.startsWith('env:')) {
      const envId = key.slice(4)
      updated.environmentIds = updated.environmentIds.filter((id) => id !== envId)
      onFilterChange(updated)
      return
    }
    if (key.startsWith('alarm:')) {
      const alarmId = key.slice(6)
      updated.alarmIds = updated.alarmIds.filter((id) => id !== alarmId)
      onFilterChange(updated)
      return
    }
    if (key.startsWith('priority:')) {
      const priorityCode = key.slice(9)
      updated.priorityCodes = updated.priorityCodes.filter((code) => code !== priorityCode)
      onFilterChange(updated)
      return
    }
    if (key.startsWith('linkType:')) {
      const linkType = key.slice(9)
      updated.linkTypes = updated.linkTypes.filter((type) => type !== linkType)
      onFilterChange(updated)
      return
    }
    switch (key) {
      case 'env': updated.environmentIds = []; break
      case 'date': updated.dateFrom = ''; updated.dateTo = ''; break
      case 'alarm': updated.alarmIds = []; break
      case 'type': updated.analysisTypes = []; break
      case 'status': updated.statuses = []; break
      case 'fa': updated.finalActionIds = []; break
      case 'priority': updated.priorityCodes = []; break
      case 'oncall': updated.isOnCall = undefined; break
      case 'operator': updated.operatorIds = []; break
      case 'search':
        search.reset()
        updated.search = ''
        break
      case 'ignore': updated.ignoreReasonCodes = []; break
      case 'runbook': updated.runbookIds = []; break
      case 'resource': updated.resourceIds = []; break
      case 'downstream': updated.downstreamIds = []; break
      case 'linkType': updated.linkTypes = []; break
      case 'trace':
        traceId.reset()
        updated.traceId = ''
        break
    }
    onFilterChange(updated)
  }

  const dateRange = useMemo(
    () => filtersToRange(filters.dateFrom, filters.dateTo),
    [filters.dateFrom, filters.dateTo],
  )

  const handleDateRangeChange = (range: DateRange | undefined) => {
    const { dateFrom, dateTo } = rangeToFilters(range)
    onFilterChange({ ...filters, dateFrom, dateTo })
  }

  const basicFilterCount = [
    filters.search,
    filters.analysisTypes.length > 0,
    filters.statuses.length > 0,
    filters.environmentIds.length > 0,
    filters.operatorIds.length > 0,
    filters.alarmIds.length > 0,
    filters.finalActionIds.length > 0,
    filters.priorityCodes.length > 0,
    filters.isOnCall !== undefined,
    filters.dateFrom || filters.dateTo,
  ].filter(Boolean).length

  const advancedFilterCount = [
    filters.ignoreReasonCodes.length > 0,
    filters.runbookIds.length > 0,
    filters.resourceIds.length > 0,
    filters.downstreamIds.length > 0,
    filters.linkTypes.length > 0,
    filters.traceId,
  ].filter(Boolean).length

  const activeFilterCount = basicFilterCount + advancedFilterCount

  const activeChips = useMemo(
    () => buildActiveChips(filters, environments, alarms, finalActions, priorityLevels, users, ignoreReasons, runbooks, resources, downstreams),
    [filters, environments, alarms, finalActions, priorityLevels, users, ignoreReasons, runbooks, resources, downstreams],
  )

  return (
    <div className="rounded-lg border">
      <AnalysisFiltersHeader
        collapsed={collapsed}
        activeFilterCount={activeFilterCount}
        activeChips={activeChips}
        onToggle={onToggleCollapsed}
        onRemoveChip={handleRemoveChip}
        onReset={handleReset}
      />

      {/* ── Expanded panel ── */}
      {!collapsed && (
        <div className="animate-in fade-in slide-in-from-top-1 [animation-duration:150ms] border-t px-4 pb-4 pt-4 space-y-4">

          <BasicAnalysisFilters
            filters={filters}
            environments={environments}
            alarms={alarms}
            finalActions={finalActions}
            priorityLevels={priorityLevels}
            users={users}
            dateRange={dateRange}
            search={search}
            onUpdate={updateFilter}
            onDateRangeChange={handleDateRangeChange}
          />

          <AdvancedAnalysisFilters
            filters={filters}
            ignoreReasons={ignoreReasons}
            resources={resources}
            downstreams={downstreams}
            runbooks={runbooks}
            linkTypes={linkTypes}
            traceId={traceId}
            onUpdate={updateFilter}
          />

          {/* Footer — reset (only when filters are active) */}
          {activeFilterCount > 0 && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                onClick={handleReset}
              >
                <X className="h-3 w-3" />
                Pulisci filtri
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
