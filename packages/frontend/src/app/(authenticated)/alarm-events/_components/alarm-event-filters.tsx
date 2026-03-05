'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X, ChevronDown, SlidersHorizontal } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Product, Environment } from '@/lib/api-client'
import { cn } from '@/lib/utils'

const ALL_VALUE = '__all__'

export interface AlarmEventFiltersState {
  productId: string
  environmentId: string
  awsAccountId: string
  awsRegion: string
  dateFrom: string
  dateTo: string
}

interface AlarmEventFiltersProps {
  filters: AlarmEventFiltersState
  onFilterChange: (filters: AlarmEventFiltersState) => void
  onReset: () => void
  products: Product[] | undefined
  environments: Environment[] | undefined
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export function AlarmEventFilters({
  filters,
  onFilterChange,
  onReset,
  products,
  environments,
  collapsed = false,
  onToggleCollapsed,
}: AlarmEventFiltersProps) {
  const updateFilter = (key: keyof AlarmEventFiltersState, value: string) => {
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
    filters.productId,
    filters.environmentId,
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

            {/* Product */}
            <div className="space-y-2">
              <Label>Prodotto</Label>
              <Select
                value={filters.productId || ALL_VALUE}
                onValueChange={(val) => {
                  onFilterChange({ ...filters, productId: val === ALL_VALUE ? '' : val, environmentId: '' })
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>Tutti</SelectItem>
                  {products?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Environment */}
            <div className="space-y-2">
              <Label>Ambiente</Label>
              <Select
                value={filters.environmentId || ALL_VALUE}
                onValueChange={(val) => updateFilter('environmentId', val === ALL_VALUE ? '' : val)}
                disabled={!filters.productId || !environments?.length}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>Tutti</SelectItem>
                  {environments?.map((env) => (
                    <SelectItem key={env.id} value={env.id}>{env.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
