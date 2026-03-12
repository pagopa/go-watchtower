'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, X, ChevronDown, SlidersHorizontal, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { Button } from '@/components/ui/button'
import type { Product, Environment } from '@/lib/api-client'
import { cn } from '@/lib/utils'

export interface AlarmEventFiltersState {
  environmentIds: string[]
  awsAccountId: string
  awsRegion: string
  dateFrom: string
  dateTo: string
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

  // Debounced aws fields
  const [awsAccountIdLocal, setAwsAccountIdLocal] = useState(filters.awsAccountId)
  const [awsRegionLocal, setAwsRegionLocal] = useState(filters.awsRegion)
  const awsAccountTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const awsRegionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (awsAccountTimer.current) clearTimeout(awsAccountTimer.current)
      if (awsRegionTimer.current) clearTimeout(awsRegionTimer.current)
    }
  }, [])

  const handleAwsAccountChange = (value: string) => {
    setAwsAccountIdLocal(value)
    if (awsAccountTimer.current) clearTimeout(awsAccountTimer.current)
    awsAccountTimer.current = setTimeout(() => {
      updateFilter('awsAccountId', value)
    }, 400)
  }

  const handleAwsRegionChange = (value: string) => {
    setAwsRegionLocal(value)
    if (awsRegionTimer.current) clearTimeout(awsRegionTimer.current)
    awsRegionTimer.current = setTimeout(() => {
      updateFilter('awsRegion', value)
    }, 400)
  }

  const handleReset = () => {
    if (awsAccountTimer.current) { clearTimeout(awsAccountTimer.current); awsAccountTimer.current = null }
    if (awsRegionTimer.current) { clearTimeout(awsRegionTimer.current); awsRegionTimer.current = null }
    setAwsAccountIdLocal('')
    setAwsRegionLocal('')
    onReset()
  }

  const activeFilterCount = [
    filters.environmentIds.length > 0,
    filters.awsAccountId,
    filters.awsRegion,
    filters.dateFrom,
    filters.dateTo,
  ].filter(Boolean).length

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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

            {/* Environment multi-select (grouped by product) — spans 2 cols */}
            <div className="space-y-2 sm:col-span-2">
              <Label>Ambiente</Label>
              <EnvironmentMultiSelect
                productEnvironments={productEnvironments}
                selected={filters.environmentIds}
                onChange={(ids) => updateFilter('environmentIds', ids)}
              />
            </div>

            {/* AWS Region */}
            <div className="space-y-2">
              <Label htmlFor="filter-aws-region">Region AWS</Label>
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

            {/* AWS Account ID */}
            <div className="space-y-2">
              <Label htmlFor="filter-aws-account">Account AWS</Label>
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

            {/* Date From */}
            <div className="space-y-2">
              <Label>Data da</Label>
              <DateTimePicker
                value={filters.dateFrom}
                onChange={(v) => updateFilter('dateFrom', v)}
                showNow
              />
            </div>

            {/* Date To */}
            <div className="space-y-2">
              <Label>Data a</Label>
              <DateTimePicker
                value={filters.dateTo}
                onChange={(v) => updateFilter('dateTo', v)}
                showNow
              />
            </div>

          </div>

          {/* Reset */}
          <div className="flex justify-end">
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
