'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { startOfMonth } from '@go-watchtower/shared'
import type { DateRange } from 'react-day-picker'
import { ArrowDown, ArrowUp, ArrowUpDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  api,
  type Alarm,
  type AlarmRankingFilters,
  type AlarmRankingItem,
  type AlarmRankingSortBy,
  type Environment,
  type Product
} from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { downloadCsv, downloadJson } from '@/lib/export-utils'
import { cn } from '@/lib/utils'
import { ExportMenu } from './export-menu'
import { ALL_VALUE } from '@/lib/constants'

interface AlarmRankingTabProps {
  products?: Product[]
}

type SortOrder = 'asc' | 'desc'
type AlarmOption = Alarm & { productName: string }
type ExportRow = {
  rank: number
  productName: string
  environmentName: string
  alarmName: string
  totalAnalyses: number
  totalOccurrences: number
  productId: string
  environmentId: string
  alarmId: string
}

const DEFAULT_SORT_BY: AlarmRankingSortBy = 'totalOccurrences'
const DEFAULT_SORT_ORDER: SortOrder = 'desc'

function buildDefaultDateRange(): DateRange {
  return { from: startOfMonth(new Date()), to: new Date() }
}

function SortableHead({
  column,
  sortBy,
  sortOrder,
  onSort,
  children,
  align = 'left'
}: {
  column: AlarmRankingSortBy
  sortBy: AlarmRankingSortBy
  sortOrder: SortOrder
  onSort: (column: AlarmRankingSortBy) => void
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  const active = sortBy === column
  const Icon = active ? (sortOrder === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <TableHead className={cn(align === 'right' && 'text-right')}>
      <button
        type="button"
        className={cn('inline-flex items-center gap-1 text-sm font-medium hover:text-foreground', align === 'right' && 'justify-end')}
        onClick={() => onSort(column)}
      >
        {children}
        <Icon className={cn('h-3.5 w-3.5', active ? 'text-foreground' : 'text-muted-foreground/50')} />
      </button>
    </TableHead>
  )
}

export function AlarmRankingTab({ products }: AlarmRankingTabProps) {
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedEnvironmentIds, setSelectedEnvironmentIds] = useState<string[]>([])
  const [selectedAlarmIds, setSelectedAlarmIds] = useState<string[]>([])
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => buildDefaultDateRange())
  const [sortBy, setSortBy] = useState<AlarmRankingSortBy>(DEFAULT_SORT_BY)
  const [sortOrder, setSortOrder] = useState<SortOrder>(DEFAULT_SORT_ORDER)

  const activeProducts = useMemo(() => products?.filter((p) => p.isActive) ?? [], [products])
  const productNameById = useMemo(() => new Map(activeProducts.map((product) => [product.id, product.name])), [activeProducts])
  const selectedProductIds = useMemo(() => {
    if (selectedProductId) return [selectedProductId]
    return activeProducts.map((product) => product.id)
  }, [activeProducts, selectedProductId])

  const { data: environments = [] } = useQuery<Environment[]>({
    queryKey: qk.products.allEnvironments(selectedProductIds),
    queryFn: async () => {
      if (selectedProductIds.length === 0) return []
      const arrays = await Promise.all(selectedProductIds.map((id) => api.getEnvironments(id)))
      return arrays.flat()
    },
    enabled: selectedProductIds.length > 0,
    staleTime: 5 * 60 * 1000
  })

  const { data: alarms = [] } = useQuery<AlarmOption[]>({
    queryKey: qk.reports.alarmRankingOptions(selectedProductIds),
    queryFn: async () => {
      if (selectedProductIds.length === 0) return []
      const arrays = await Promise.all(
        selectedProductIds.map(async (productId) => {
          const productName = productNameById.get(productId) ?? 'Unknown'
          const productAlarms = await api.getAlarms(productId)
          return productAlarms.map((alarm) => ({ ...alarm, productName }))
        })
      )
      return arrays.flat()
    },
    enabled: selectedProductIds.length > 0,
    staleTime: 5 * 60 * 1000
  })

  const environmentOptions = useMemo(
    () =>
      [...environments]
        .sort((a, b) => {
          const productComparison = (productNameById.get(a.productId) ?? '').localeCompare(productNameById.get(b.productId) ?? '', 'it', {
            sensitivity: 'base'
          })
          if (productComparison !== 0) return productComparison
          return a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
        })
        .map((environment) => ({
          value: environment.id,
          label: selectedProductId ? environment.name : `${productNameById.get(environment.productId) ?? 'Unknown'} / ${environment.name}`
        })),
    [environments, productNameById, selectedProductId]
  )

  const alarmOptions = useMemo(
    () =>
      [...alarms]
        .sort((a, b) => {
          const productComparison = a.productName.localeCompare(b.productName, 'it', { sensitivity: 'base' })
          if (productComparison !== 0) return productComparison
          return a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
        })
        .map((alarm) => ({
          value: alarm.id,
          label: selectedProductId ? alarm.name : `${alarm.productName} / ${alarm.name}`
        })),
    [alarms, selectedProductId]
  )

  const filters = useMemo<AlarmRankingFilters>(() => {
    const next: AlarmRankingFilters = { sortBy, sortOrder }
    if (selectedProductId) next.productId = selectedProductId
    if (selectedEnvironmentIds.length > 0) next.environmentId = selectedEnvironmentIds
    if (selectedAlarmIds.length > 0) next.alarmId = selectedAlarmIds
    if (dateRange?.from) next.dateFrom = dateRange.from.toISOString()
    if (dateRange?.to) next.dateTo = dateRange.to.toISOString()
    return next
  }, [dateRange, selectedAlarmIds, selectedEnvironmentIds, selectedProductId, sortBy, sortOrder])

  const { data, isLoading } = useQuery<AlarmRankingItem[]>({
    queryKey: qk.reports.alarmRanking(filters),
    queryFn: () => api.getAlarmRanking(filters)
  })

  const exportRows = useMemo<ExportRow[]>(
    () =>
      (data ?? []).map((item, index) => ({
        rank: index + 1,
        productName: item.productName,
        environmentName: item.environmentName,
        alarmName: item.alarmName,
        totalAnalyses: item.totalAnalyses,
        totalOccurrences: item.totalOccurrences,
        productId: item.productId,
        environmentId: item.environmentId,
        alarmId: item.alarmId
      })),
    [data]
  )

  const handleProductChange = (value: string) => {
    setSelectedProductId(value === ALL_VALUE ? '' : value)
    setSelectedEnvironmentIds([])
    setSelectedAlarmIds([])
  }

  const handleSort = (column: AlarmRankingSortBy) => {
    if (sortBy === column) {
      setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortOrder(column === 'alarmName' || column === 'productName' || column === 'environmentName' ? 'asc' : 'desc')
    }
  }

  const handleResetFilters = () => {
    setSelectedProductId('')
    setSelectedEnvironmentIds([])
    setSelectedAlarmIds([])
    setDateRange(buildDefaultDateRange())
    setSortBy(DEFAULT_SORT_BY)
    setSortOrder(DEFAULT_SORT_ORDER)
  }

  const handleExportCsv = () => {
    downloadCsv(
      exportRows,
      [
        { key: 'rank', label: '#' },
        { key: 'productName', label: 'Prodotto' },
        { key: 'environmentName', label: 'Ambiente' },
        { key: 'alarmName', label: 'Allarme' },
        { key: 'totalAnalyses', label: 'Analisi' },
        { key: 'totalOccurrences', label: 'Occorrenze' },
        { key: 'productId', label: 'Product ID' },
        { key: 'environmentId', label: 'Environment ID' },
        { key: 'alarmId', label: 'Alarm ID' }
      ],
      'classifica-allarmi'
    )
  }

  const handleExportJson = () => {
    downloadJson(
      {
        generatedAt: new Date().toISOString(),
        filters,
        count: exportRows.length,
        rows: exportRows
      },
      'classifica-allarmi'
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,1.2fr)_minmax(220px,0.8fr)_minmax(220px,1fr)_minmax(260px,1.2fr)_auto]">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Periodo</Label>
            <div className="flex items-center gap-2">
              <DateRangePicker value={dateRange} onChange={setDateRange} className="w-full" />
              {dateRange && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setDateRange(undefined)}
                  title="Tutti i periodi"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Prodotto</Label>
            <Select value={selectedProductId || ALL_VALUE} onValueChange={handleProductChange}>
              <SelectTrigger>
                <SelectValue placeholder="Tutti" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>Tutti i prodotti</SelectItem>
                {activeProducts.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Ambiente</Label>
            <MultiSelectCombobox
              showTags={false}
              options={environmentOptions}
              value={selectedEnvironmentIds}
              onValueChange={setSelectedEnvironmentIds}
              placeholder="Tutti gli ambienti"
              searchPlaceholder="Cerca ambiente..."
              emptyMessage="Nessun ambiente trovato."
              disabled={selectedProductIds.length === 0}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Allarme</Label>
            <MultiSelectCombobox
              showTags={false}
              options={alarmOptions}
              value={selectedAlarmIds}
              onValueChange={setSelectedAlarmIds}
              placeholder="Tutti gli allarmi"
              searchPlaceholder="Cerca allarme..."
              emptyMessage="Nessun allarme trovato."
              disabled={selectedProductIds.length === 0}
            />
          </div>

          <div className="flex items-end gap-2">
            <Button variant="ghost" size="sm" onClick={handleResetFilters}>
              Pulisci
            </Button>
            <ExportMenu onExportCsv={handleExportCsv} onExportJson={handleExportJson} disabled={exportRows.length === 0} />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : exportRows.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Nessun dato disponibile per i filtri selezionati.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14 text-center">#</TableHead>
                <SortableHead column="alarmName" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>
                  Allarme
                </SortableHead>
                <SortableHead column="productName" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>
                  Prodotto
                </SortableHead>
                <SortableHead column="environmentName" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>
                  Ambiente
                </SortableHead>
                <SortableHead column="totalAnalyses" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right">
                  Analisi
                </SortableHead>
                <SortableHead column="totalOccurrences" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right">
                  Occorrenze
                </SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((item, index) => (
                <TableRow key={`${item.productId}:${item.environmentId}:${item.alarmId}`}>
                  <TableCell className="text-center font-medium text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/alarms/${item.productId}/${item.alarmId}`}
                      className="hover:underline hover:text-primary transition-colors"
                    >
                      {item.alarmName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.productName}</TableCell>
                  <TableCell className="text-muted-foreground">{item.environmentName}</TableCell>
                  <TableCell className="text-right">{item.totalAnalyses}</TableCell>
                  <TableCell className="text-right font-medium">{item.totalOccurrences}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
