'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, X, ChevronDown, SlidersHorizontal, Check } from 'lucide-react'
import { formatJsDate, subDays, startOfMonth } from '@go-watchtower/shared'
import type { DateRange } from 'react-day-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DateRangePicker, type DateRangePreset } from '@/components/ui/date-range-picker'
import { Button } from '@/components/ui/button'
import type { Product, Environment } from '@/lib/api-client'
import { cn } from '@/lib/utils'

export interface AlarmEventFiltersState {
  environmentIds: string[]
  awsAccountId: string
  awsRegion: string
  dateFrom: string
  dateTo: string
  hasAnalysis: '' | 'with' | 'without'
  alarmName: string
}

/** Product with its environments, used to build grouped multi-select. */
export interface ProductWithEnvironments {
  product: Product
  environments: Environment[]
}

interface AlarmEventFiltersProps {
  filters: AlarmEventFiltersState
  onFilterChange: (filters: AlarmEventFiltersState) => void
  onReset: () => void
  productEnvironments: ProductWithEnvironments[]
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
  const dateFrom = sod(new Date(range.from)).toISOString()
  const dateTo = range.to ? eod(new Date(range.to)).toISOString() : ''
  return { dateFrom, dateTo }
}

function sod(d: Date): Date { d.setHours(0, 0, 0, 0); return d }
function eod(d: Date): Date { d.setHours(23, 59, 59, 999); return d }

const ALARM_DATE_PRESETS: DateRangePreset[] = [
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
  filters: AlarmEventFiltersState,
  productEnvironments: ProductWithEnvironments[],
): FilterChip[] {
  const chips: FilterChip[] = []

  if (filters.environmentIds.length > 0) {
    // Build a envId → "Prodotto\Ambiente" lookup
    const envLabelMap = new Map<string, string>()
    for (const pe of productEnvironments) {
      for (const env of pe.environments) {
        envLabelMap.set(env.id, `${pe.product.name}\\${env.name}`)
      }
    }
    if (filters.environmentIds.length <= 2) {
      for (const envId of filters.environmentIds) {
        const label = envLabelMap.get(envId) ?? envId
        chips.push({ key: `env:${envId}`, label })
      }
    } else {
      chips.push({ key: 'env', label: `${filters.environmentIds.length} ambienti` })
    }
  }

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

  if (filters.hasAnalysis === 'with') {
    chips.push({ key: 'analysis', label: 'Con analisi' })
  } else if (filters.hasAnalysis === 'without') {
    chips.push({ key: 'analysis', label: 'Senza analisi' })
  }

  if (filters.alarmName) {
    const name = filters.alarmName.length > 18 ? filters.alarmName.slice(0, 18) + '\u2026' : filters.alarmName
    chips.push({ key: 'name', label: name })
  }

  if (filters.awsRegion) {
    chips.push({ key: 'region', label: filters.awsRegion })
  }

  if (filters.awsAccountId) {
    const acc = filters.awsAccountId.length > 12
      ? '\u2026' + filters.awsAccountId.slice(-8)
      : filters.awsAccountId
    chips.push({ key: 'account', label: acc })
  }

  return chips
}

// ─── Segmented toggle options ─────────────────────────────────────────────────

const ANALYSIS_OPTIONS = [
  { value: '' as const, label: 'Tutti' },
  { value: 'with' as const, label: 'Con' },
  { value: 'without' as const, label: 'Senza' },
]

// ─── Main component ──────────────────────────────────────────────────────────

export function AlarmEventFilters({
  filters,
  onFilterChange,
  onReset,
  productEnvironments,
  collapsed = false,
  onToggleCollapsed,
}: AlarmEventFiltersProps) {
  const updateFilter = <K extends keyof AlarmEventFiltersState>(key: K, value: AlarmEventFiltersState[K]) => {
    onFilterChange({ ...filters, [key]: value })
  }

  // Debounced text fields
  const [awsAccountIdLocal, setAwsAccountIdLocal] = useState(filters.awsAccountId)
  const [awsRegionLocal, setAwsRegionLocal] = useState(filters.awsRegion)
  const [alarmNameLocal, setAlarmNameLocal] = useState(filters.alarmName)
  const awsAccountTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const awsRegionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alarmNameTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (awsAccountTimer.current) clearTimeout(awsAccountTimer.current)
      if (awsRegionTimer.current) clearTimeout(awsRegionTimer.current)
      if (alarmNameTimer.current) clearTimeout(alarmNameTimer.current)
    }
  }, [])

  const handleAwsAccountChange = (value: string) => {
    setAwsAccountIdLocal(value)
    if (awsAccountTimer.current) clearTimeout(awsAccountTimer.current)
    awsAccountTimer.current = setTimeout(() => updateFilter('awsAccountId', value), 400)
  }

  const handleAwsRegionChange = (value: string) => {
    setAwsRegionLocal(value)
    if (awsRegionTimer.current) clearTimeout(awsRegionTimer.current)
    awsRegionTimer.current = setTimeout(() => updateFilter('awsRegion', value), 400)
  }

  const handleAlarmNameChange = (value: string) => {
    setAlarmNameLocal(value)
    if (alarmNameTimer.current) clearTimeout(alarmNameTimer.current)
    alarmNameTimer.current = setTimeout(() => updateFilter('alarmName', value), 400)
  }

  const handleReset = () => {
    if (awsAccountTimer.current) { clearTimeout(awsAccountTimer.current); awsAccountTimer.current = null }
    if (awsRegionTimer.current) { clearTimeout(awsRegionTimer.current); awsRegionTimer.current = null }
    if (alarmNameTimer.current) { clearTimeout(alarmNameTimer.current); alarmNameTimer.current = null }
    setAwsAccountIdLocal('')
    setAwsRegionLocal('')
    setAlarmNameLocal('')
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
    switch (key) {
      case 'env': updated.environmentIds = []; break
      case 'date': updated.dateFrom = ''; updated.dateTo = ''; break
      case 'analysis': updated.hasAnalysis = ''; break
      case 'name':
        if (alarmNameTimer.current) { clearTimeout(alarmNameTimer.current); alarmNameTimer.current = null }
        setAlarmNameLocal('')
        updated.alarmName = ''
        break
      case 'region':
        if (awsRegionTimer.current) { clearTimeout(awsRegionTimer.current); awsRegionTimer.current = null }
        setAwsRegionLocal('')
        updated.awsRegion = ''
        break
      case 'account':
        if (awsAccountTimer.current) { clearTimeout(awsAccountTimer.current); awsAccountTimer.current = null }
        setAwsAccountIdLocal('')
        updated.awsAccountId = ''
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

  const activeFilterCount = [
    filters.environmentIds.length > 0,
    filters.awsAccountId,
    filters.awsRegion,
    filters.dateFrom || filters.dateTo,
    filters.hasAnalysis,
    filters.alarmName,
  ].filter(Boolean).length

  const activeChips = useMemo(
    () => buildActiveChips(filters, productEnvironments),
    [filters, productEnvironments],
  )

  return (
    <div className="rounded-lg border">
      {/* ── Header ── */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        {/* Left: icon + label + count */}
        <div className="flex items-center gap-2 shrink-0">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <span>Filtri</span>
          {activeFilterCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </div>

        {/* Center: active filter chips (collapsed only) */}
        {collapsed && activeChips.length > 0 && (
          <div className="flex flex-1 items-center gap-1.5 overflow-hidden min-w-0">
            {activeChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                <span className="truncate max-w-[200px]">{chip.label}</span>
                <X
                  className="h-3 w-3 shrink-0 cursor-pointer opacity-60 hover:opacity-100 hover:text-foreground transition-opacity"
                  onClick={(e) => { e.stopPropagation(); handleRemoveChip(chip.key) }}
                />
              </span>
            ))}
          </div>
        )}

        {/* Right: reset + chevron */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {collapsed && activeFilterCount > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); handleReset() }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleReset() } }}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              title="Pulisci filtri"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', !collapsed && 'rotate-180')} />
        </div>
      </button>

      {/* ── Expanded panel ── */}
      {!collapsed && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-150 border-t px-4 pb-4 pt-4 space-y-4">

          {/* Row 1 — primary scope filters */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Ambiente</Label>
              <EnvironmentMultiSelect
                productEnvironments={productEnvironments}
                selected={filters.environmentIds}
                onChange={(ids) => updateFilter('environmentIds', ids)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Periodo</Label>
              <DateRangePicker
                value={dateRange}
                onChange={handleDateRangeChange}
                presets={ALARM_DATE_PRESETS}
                className="w-full"
              />
            </div>
          </div>

          {/* Row 2 — detail filters */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

            {/* Analisi collegata — segmented toggle */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Analisi collegata</Label>
              <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 p-0.5">
                {ANALYSIS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateFilter('hasAnalysis', opt.value)}
                    className={cn(
                      'flex-1 rounded-[5px] px-2 py-1 text-xs font-medium transition-all',
                      filters.hasAnalysis === opt.value
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Nome allarme */}
            <div className="space-y-1.5">
              <Label htmlFor="filter-alarm-name" className="text-xs text-muted-foreground">Nome allarme</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="filter-alarm-name"
                  placeholder="Cerca allarme..."
                  value={alarmNameLocal}
                  onChange={(e) => handleAlarmNameChange(e.target.value)}
                  className="pl-8 text-sm"
                />
              </div>
            </div>

            {/* Region AWS */}
            <div className="space-y-1.5">
              <Label htmlFor="filter-aws-region" className="text-xs text-muted-foreground">Region AWS</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="filter-aws-region"
                  placeholder="es. eu-south-1"
                  value={awsRegionLocal}
                  onChange={(e) => handleAwsRegionChange(e.target.value)}
                  className="pl-8 font-mono text-sm"
                />
              </div>
            </div>

            {/* Account AWS */}
            <div className="space-y-1.5">
              <Label htmlFor="filter-aws-account" className="text-xs text-muted-foreground">Account AWS</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="filter-aws-account"
                  placeholder="Account ID..."
                  value={awsAccountIdLocal}
                  onChange={(e) => handleAwsAccountChange(e.target.value)}
                  className="pl-8 font-mono text-sm"
                />
              </div>
            </div>

          </div>

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

// ─── EnvironmentMultiSelect (grouped by product) ────────────────────────────

function EnvironmentMultiSelect({
  productEnvironments,
  selected,
  onChange,
}: {
  productEnvironments: ProductWithEnvironments[]
  selected: string[]
  onChange: (values: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Close when clicking outside
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

  const toggle = (envId: string) => {
    onChange(
      selected.includes(envId)
        ? selected.filter((id) => id !== envId)
        : [...selected, envId]
    )
  }

  const toggleProduct = (pe: ProductWithEnvironments) => {
    const envIds = pe.environments.map((e) => e.id)
    const allSelected = envIds.every((id) => selected.includes(id))
    if (allSelected) {
      onChange(selected.filter((id) => !envIds.includes(id)))
    } else {
      const toAdd = envIds.filter((id) => !selected.includes(id))
      onChange([...selected, ...toAdd])
    }
  }

  const filteredGroups = useMemo(() => {
    if (!search) return productEnvironments
    const q = search.toLowerCase()
    return productEnvironments
      .map((pe) => ({
        ...pe,
        environments: pe.environments.filter((e) =>
          e.name.toLowerCase().includes(q) || pe.product.name.toLowerCase().includes(q)
        ),
      }))
      .filter((pe) => pe.environments.length > 0)
  }, [search, productEnvironments])

  const totalEnvCount = productEnvironments.reduce((sum, pe) => sum + pe.environments.length, 0)

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate text-muted-foreground">
          {selected.length === 0
            ? 'Tutti gli ambienti'
            : selected.length === totalEnvCount
            ? 'Tutti gli ambienti'
            : `${selected.length} ${selected.length === 1 ? 'ambiente' : 'ambienti'}`}
        </span>
        {selected.length > 0 && selected.length < totalEnvCount ? (
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
                placeholder="Filtra ambienti..."
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

            {filteredGroups.map((pe) => {
              const envIds = pe.environments.map((e) => e.id)
              const allSelected = envIds.every((id) => selected.includes(id))
              const someSelected = envIds.some((id) => selected.includes(id))

              return (
                <div key={pe.product.id} className="mt-1 first:mt-0">
                  {/* Product group header */}
                  <button
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent transition-colors"
                    onClick={() => toggleProduct(pe)}
                  >
                    <div
                      className={cn(
                        'h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition-colors',
                        allSelected
                          ? 'bg-primary border-primary'
                          : someSelected
                          ? 'border-primary bg-primary/20'
                          : 'border-muted-foreground/30'
                      )}
                    >
                      {allSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                      {someSelected && !allSelected && (
                        <span className="h-1.5 w-1.5 rounded-sm bg-primary" />
                      )}
                    </div>
                    <span className="text-sm font-medium">{pe.product.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{pe.environments.length}</span>
                  </button>

                  {/* Environment items */}
                  <div className="ml-4 space-y-0.5">
                    {pe.environments.map((env) => {
                      const isSelected = selected.includes(env.id)
                      return (
                        <button
                          key={env.id}
                          className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent transition-colors"
                          onClick={() => toggle(env.id)}
                        >
                          <div
                            className={cn(
                              'h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition-colors',
                              isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                            )}
                          >
                            {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                          </div>
                          <span className="text-sm">{env.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {filteredGroups.length === 0 && (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">Nessun ambiente trovato</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
