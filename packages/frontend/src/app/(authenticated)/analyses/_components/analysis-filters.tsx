'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, X, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react'
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
import type {
  Environment,
  Alarm,
  FinalAction,
  AnalysisAuthor,
  AnalysisType,
  AnalysisStatus,
} from '@/lib/api-client'
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
}

interface AnalysisFiltersProps {
  filters: AnalysisFiltersState
  onFilterChange: (filters: AnalysisFiltersState) => void
  onReset: () => void
  environments: Environment[] | undefined
  alarms: Alarm[] | undefined
  finalActions: FinalAction[] | undefined
  users: AnalysisAuthor[] | undefined
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
  collapsed = false,
  onToggleCollapsed,
}: AnalysisFiltersProps) {
  const updateFilter = (key: keyof AnalysisFiltersState, value: string | boolean | undefined) => {
    onFilterChange({ ...filters, [key]: value })
  }

  // Debounced search: local state updates instantly (responsive input),
  // but the parent filter only updates after 400ms of inactivity.
  const [searchLocal, setSearchLocal] = useState(filters.search)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (searchTimer.current) {
        clearTimeout(searchTimer.current)
      }
    }
  }, [])

  const handleSearchChange = (value: string) => {
    setSearchLocal(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      updateFilter('search', value)
    }, 400)
  }

  const handleReset = () => {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current)
      searchTimer.current = null
    }
    setSearchLocal('')
    onReset()
  }

  const activeFilterCount = useMemo(() => [
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
  ].filter(Boolean).length, [filters])

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
        {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>

      {!collapsed && (
      <div className="space-y-4 border-t px-4 pb-4 pt-4">
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
            <Select
              value={filters.alarmId || ALL_VALUE}
              onValueChange={(val) => updateFilter('alarmId', val === ALL_VALUE ? '' : val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Tutti" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>Tutti</SelectItem>
                {alarms.map((alarm) => (
                  <SelectItem key={alarm.id} value={alarm.id}>
                    {alarm.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      <div className="flex items-center justify-between">
        {/* On-Call Switch */}
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

        {/* Reset Filters */}
        <Button variant="outline" size="sm" onClick={handleReset}>
          <X className="mr-2 h-4 w-4" />
          Pulisci filtri
        </Button>
      </div>
      </div>
      )}
    </div>
  )
}
