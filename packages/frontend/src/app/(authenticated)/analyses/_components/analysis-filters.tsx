'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X, ChevronDown, SlidersHorizontal, Settings2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'
import type {
  Environment,
  Alarm,
  FinalAction,
  AnalysisAuthor,
  AnalysisType,
  AnalysisStatus,
  IgnoreReason,
  Microservice,
  Downstream,
  Runbook,
} from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { ANALYSIS_TYPE_LABELS, ANALYSIS_STATUS_LABELS } from '../_lib/constants'

const ALL_VALUE = '__all__'

export interface AnalysisFiltersState {
  search: string
  analysisType: string
  status: string
  environmentId: string
  operatorId: string
  alarmId: string
  finalActionId: string
  isOnCall: boolean | undefined
  dateFrom: string
  dateTo: string
  // Advanced filters
  ignoreReasonCode: string
  runbookId: string
  microserviceId: string
  downstreamId: string
  traceId: string
}

interface AnalysisFiltersProps {
  filters: AnalysisFiltersState
  onFilterChange: (filters: AnalysisFiltersState) => void
  onReset: () => void
  environments: Environment[] | undefined
  alarms: Alarm[] | undefined
  finalActions: FinalAction[] | undefined
  users: AnalysisAuthor[] | undefined
  ignoreReasons: IgnoreReason[] | undefined
  microservices: Microservice[] | undefined
  downstreams: Downstream[] | undefined
  runbooks: Runbook[] | undefined
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export function AnalysisFilters({
  filters,
  onFilterChange,
  onReset,
  environments,
  alarms,
  finalActions,
  users,
  ignoreReasons,
  microservices,
  downstreams,
  runbooks,
  collapsed = false,
  onToggleCollapsed,
}: AnalysisFiltersProps) {
  const updateFilter = (key: keyof AnalysisFiltersState, value: string | boolean | undefined) => {
    onFilterChange({ ...filters, [key]: value })
  }

  // Debounced search
  const [searchLocal, setSearchLocal] = useState(filters.search)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced traceId
  const [traceIdLocal, setTraceIdLocal] = useState(filters.traceId)
  const traceIdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
      if (traceIdTimer.current) clearTimeout(traceIdTimer.current)
    }
  }, [])

  const handleSearchChange = (value: string) => {
    setSearchLocal(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      updateFilter('search', value)
    }, 400)
  }

  const handleTraceIdChange = (value: string) => {
    setTraceIdLocal(value)
    if (traceIdTimer.current) clearTimeout(traceIdTimer.current)
    traceIdTimer.current = setTimeout(() => {
      updateFilter('traceId', value)
    }, 400)
  }

  const handleReset = () => {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current)
      searchTimer.current = null
    }
    if (traceIdTimer.current) {
      clearTimeout(traceIdTimer.current)
      traceIdTimer.current = null
    }
    setSearchLocal('')
    setTraceIdLocal('')
    onReset()
  }

  // Advanced filters section open/closed (local state — resets on page navigation)
  const [advancedOpen, setAdvancedOpen] = useState(() => {
    return !!(
      filters.ignoreReasonCode ||
      filters.runbookId ||
      filters.microserviceId ||
      filters.downstreamId ||
      filters.traceId
    )
  })

  const basicFilterCount = [
    filters.search,
    filters.analysisType,
    filters.status,
    filters.environmentId,
    filters.operatorId,
    filters.alarmId,
    filters.finalActionId,
    filters.isOnCall !== undefined ? 'on' : '',
    filters.dateFrom,
    filters.dateTo,
  ].filter(Boolean).length

  const advancedFilterCount = [
    filters.ignoreReasonCode,
    filters.runbookId,
    filters.microserviceId,
    filters.downstreamId,
    filters.traceId,
  ].filter(Boolean).length

  const activeFilterCount = basicFilterCount + advancedFilterCount

  // Whether any product-scoped advanced filters are available
  const hasProductScopedAdvanced = !!(microservices || downstreams || runbooks)

  return (
    <div className="rounded-lg border">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="flex w-full items-center justify-between p-4 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          <span>Filtri</span>
          {activeFilterCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </div>
        <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', !collapsed && 'rotate-180')} />
      </button>

      {!collapsed && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-150 space-y-4 border-t px-4 pb-4 pt-4">

          {/* ── Basic filters ──────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Search */}
            <div className="space-y-2">
              <Label htmlFor="filter-search">Ricerca</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="filter-search"
                  placeholder="Cerca nei dettagli..."
                  value={searchLocal}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            {/* Analysis Type */}
            <div className="space-y-2">
              <Label>Tipo analisi</Label>
              <Select
                value={filters.analysisType || ALL_VALUE}
                onValueChange={(val) => updateFilter('analysisType', val === ALL_VALUE ? '' : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>Tutti</SelectItem>
                  {(Object.keys(ANALYSIS_TYPE_LABELS) as AnalysisType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {ANALYSIS_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label>Stato</Label>
              <Select
                value={filters.status || ALL_VALUE}
                onValueChange={(val) => updateFilter('status', val === ALL_VALUE ? '' : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>Tutti</SelectItem>
                  {(Object.keys(ANALYSIS_STATUS_LABELS) as AnalysisStatus[]).map((status) => (
                    <SelectItem key={status} value={status}>
                      {ANALYSIS_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Operator */}
            <div className="space-y-2">
              <Label>Operatore</Label>
              <Select
                value={filters.operatorId || ALL_VALUE}
                onValueChange={(val) => updateFilter('operatorId', val === ALL_VALUE ? '' : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>Tutti</SelectItem>
                  {users?.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date From */}
            <div className="space-y-2">
              <Label>Data da</Label>
              <DateTimePicker
                value={filters.dateFrom}
                onChange={(v) => updateFilter('dateFrom', v)}
                dateOnly
                showNow
              />
            </div>

            {/* Date To */}
            <div className="space-y-2">
              <Label>Data a</Label>
              <DateTimePicker
                value={filters.dateTo}
                onChange={(v) => updateFilter('dateTo', v)}
                dateOnly
                showNow
              />
            </div>

            {/* Environment (only when product is selected) */}
            {environments && (
              <div className="space-y-2">
                <Label>Ambiente</Label>
                <Select
                  value={filters.environmentId || ALL_VALUE}
                  onValueChange={(val) => updateFilter('environmentId', val === ALL_VALUE ? '' : val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tutti" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>Tutti</SelectItem>
                    {environments.map((env) => (
                      <SelectItem key={env.id} value={env.id}>
                        {env.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Alarm (only when product is selected) */}
            {alarms && (
              <div className="space-y-2">
                <Label>Allarme</Label>
                <Combobox
                  options={[
                    { value: ALL_VALUE, label: 'Tutti' },
                    ...alarms.map((alarm) => ({ value: alarm.id, label: alarm.name })),
                  ]}
                  value={filters.alarmId || ALL_VALUE}
                  onValueChange={(val) => updateFilter('alarmId', val === ALL_VALUE || val === '' ? '' : val)}
                  placeholder="Tutti"
                  searchPlaceholder="Cerca allarme..."
                  emptyMessage="Nessun allarme trovato."
                />
              </div>
            )}

            {/* Final Action (only when product is selected) */}
            {finalActions && (
              <div className="space-y-2">
                <Label>Azione Finale</Label>
                <Select
                  value={filters.finalActionId || ALL_VALUE}
                  onValueChange={(val) => updateFilter('finalActionId', val === ALL_VALUE ? '' : val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tutti" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>Tutti</SelectItem>
                    {finalActions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* On-Call + Reset row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                id="filter-oncall"
                checked={filters.isOnCall === true}
                onCheckedChange={(checked) =>
                  updateFilter('isOnCall', checked ? true : undefined)
                }
              />
              <Label htmlFor="filter-oncall" className="cursor-pointer">
                Solo reperibilità
              </Label>
            </div>

            <Button variant="outline" size="sm" onClick={handleReset}>
              <X className="mr-2 h-4 w-4" />
              Pulisci filtri
            </Button>
          </div>

          {/* ── Advanced filters toggle ─────────────────────────────────── */}
          <div className="border-t pt-3">
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span>Filtri avanzati</span>
              {advancedFilterCount > 0 && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                  {advancedFilterCount}
                </span>
              )}
              <ChevronDown className={cn('h-3.5 w-3.5 ml-auto transition-transform duration-200', advancedOpen && 'rotate-180')} />
            </button>

            {advancedOpen && (
              <div className="animate-in fade-in slide-in-from-top-1 duration-150 mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

                {/* Ignore Reason */}
                {ignoreReasons && ignoreReasons.length > 0 && (
                  <div className="space-y-2">
                    <Label>Motivazione ignore</Label>
                    <Select
                      value={filters.ignoreReasonCode || ALL_VALUE}
                      onValueChange={(val) => updateFilter('ignoreReasonCode', val === ALL_VALUE ? '' : val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Tutte" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VALUE}>Tutte</SelectItem>
                        {ignoreReasons.map((r) => (
                          <SelectItem key={r.code} value={r.code}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Trace ID */}
                <div className="space-y-2">
                  <Label htmlFor="filter-traceid">ID Tracciamento</Label>
                  <Input
                    id="filter-traceid"
                    placeholder="Cerca trace ID esatto..."
                    value={traceIdLocal}
                    onChange={(e) => handleTraceIdChange(e.target.value)}
                  />
                </div>

                {/* Runbook (only when product is selected) */}
                {runbooks && (
                  <div className="space-y-2">
                    <Label>Runbook</Label>
                    <Combobox
                      options={[
                        { value: ALL_VALUE, label: 'Tutti' },
                        ...runbooks.map((r) => ({ value: r.id, label: r.name })),
                      ]}
                      value={filters.runbookId || ALL_VALUE}
                      onValueChange={(val) => updateFilter('runbookId', val === ALL_VALUE || val === '' ? '' : val)}
                      placeholder="Tutti"
                      searchPlaceholder="Cerca runbook..."
                      emptyMessage="Nessun runbook trovato."
                    />
                  </div>
                )}

                {/* Microservice (only when product is selected) */}
                {microservices && (
                  <div className="space-y-2">
                    <Label>Microservizio</Label>
                    <Combobox
                      options={[
                        { value: ALL_VALUE, label: 'Tutti' },
                        ...microservices.map((m) => ({ value: m.id, label: m.name })),
                      ]}
                      value={filters.microserviceId || ALL_VALUE}
                      onValueChange={(val) => updateFilter('microserviceId', val === ALL_VALUE || val === '' ? '' : val)}
                      placeholder="Tutti"
                      searchPlaceholder="Cerca microservizio..."
                      emptyMessage="Nessun microservizio trovato."
                    />
                  </div>
                )}

                {/* Downstream (only when product is selected) */}
                {downstreams && (
                  <div className="space-y-2">
                    <Label>Downstream</Label>
                    <Combobox
                      options={[
                        { value: ALL_VALUE, label: 'Tutti' },
                        ...downstreams.map((d) => ({ value: d.id, label: d.name })),
                      ]}
                      value={filters.downstreamId || ALL_VALUE}
                      onValueChange={(val) => updateFilter('downstreamId', val === ALL_VALUE || val === '' ? '' : val)}
                      placeholder="Tutti"
                      searchPlaceholder="Cerca downstream..."
                      emptyMessage="Nessun downstream trovato."
                    />
                  </div>
                )}

                {/* Placeholder when no product is selected */}
                {!hasProductScopedAdvanced && (
                  <p className="col-span-full text-xs text-muted-foreground/60">
                    Seleziona un prodotto per filtrare per microservizio, downstream e runbook.
                  </p>
                )}

              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
