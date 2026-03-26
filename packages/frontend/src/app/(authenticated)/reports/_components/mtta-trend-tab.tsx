'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { startOfMonth, subMonths, formatDuration } from '@go-watchtower/shared'
import type { DateRange } from 'react-day-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type Product, type MttaTrendItem } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { downloadCsv, downloadJson } from '@/lib/export-utils'
import { ExportMenu } from './export-menu'
import { ALL_VALUE } from '@/lib/constants'
import { MttaTrendChart } from './mtta-trend-chart'

interface MttaTrendTabProps {
  products?: Product[]
}

function formatPeriod(period: string, granularity: 'weekly' | 'monthly'): string {
  const d = new Date(period + 'T00:00:00')
  if (granularity === 'monthly') {
    return d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
  }
  // Weekly: show "dd/mm – dd/mm"
  const end = new Date(d)
  end.setDate(end.getDate() + 6)
  const fmt = (dt: Date) => dt.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
  return `${fmt(d)} – ${fmt(end)}`
}

export function MttaTrendTab({ products }: MttaTrendTabProps) {
  const [selectedProductId, setSelectedProductId] = useState('')
  const [granularity, setGranularity] = useState<'weekly' | 'monthly'>('weekly')
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(subMonths(new Date(), 6)),
    to: new Date(),
  })

  const filters = useMemo(() => {
    const f: Record<string, string> = { granularity }
    if (selectedProductId) f.productId = selectedProductId
    if (dateRange?.from) f.dateFrom = dateRange.from.toISOString()
    if (dateRange?.to) f.dateTo = dateRange.to.toISOString()
    return f
  }, [selectedProductId, dateRange, granularity])

  const { data, isLoading } = useQuery<MttaTrendItem[]>({
    queryKey: qk.reports.mttaTrend(filters),
    queryFn: () => api.getMttaTrend(filters),
  })

  const handleExportCsv = useCallback(() => {
    if (!data) return
    const rows = data.map((item) => ({
      period: formatPeriod(item.period, granularity),
      avgMtta: formatDuration(item.avgMttaMs),
      medianMtta: formatDuration(item.medianMttaMs),
      avgMttr: formatDuration(item.avgMttrMs),
      medianMttr: formatDuration(item.medianMttrMs),
      eventCount: item.eventCount,
      resolvedCount: item.resolvedCount,
    }))
    downloadCsv(rows, [
      { key: 'period', label: 'Periodo' },
      { key: 'avgMtta', label: 'MTTA Medio' },
      { key: 'medianMtta', label: 'MTTA Mediano' },
      { key: 'avgMttr', label: 'MTTR Medio' },
      { key: 'medianMttr', label: 'MTTR Mediano' },
      { key: 'eventCount', label: 'Eventi' },
      { key: 'resolvedCount', label: 'Risolti' },
    ], 'mtta-mttr-trend')
  }, [data, granularity])

  const handleExportJson = useCallback(() => {
    if (!data) return
    downloadJson(data, 'mtta-mttr-trend')
  }, [data])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Periodo</Label>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Prodotto</Label>
          <Select
            value={selectedProductId || ALL_VALUE}
            onValueChange={(val) => setSelectedProductId(val === ALL_VALUE ? '' : val)}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Tutti" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Tutti i prodotti</SelectItem>
              {products?.filter(p => p.isActive).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Granularità</Label>
          <Select value={granularity} onValueChange={(val) => setGranularity(val as 'weekly' | 'monthly')}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Settimanale</SelectItem>
              <SelectItem value="monthly">Mensile</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto">
          <ExportMenu onExportCsv={handleExportCsv} onExportJson={handleExportJson} disabled={!data?.length} />
        </div>
      </div>

      {/* Chart */}
      {isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : data && data.length > 0 ? (
        <MttaTrendChart data={data} granularity={granularity} />
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center h-[300px]">
            <p className="text-muted-foreground">Nessun dato disponibile per il periodo selezionato</p>
          </CardContent>
        </Card>
      )}

      {/* Summary table */}
      {data && data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dettaglio per periodo</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periodo</TableHead>
                  <TableHead className="text-right">MTTA Medio</TableHead>
                  <TableHead className="text-right">MTTA Mediano</TableHead>
                  <TableHead className="text-right">MTTR Medio</TableHead>
                  <TableHead className="text-right">MTTR Mediano</TableHead>
                  <TableHead className="text-right">Eventi</TableHead>
                  <TableHead className="text-right">Risolti</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item) => (
                  <TableRow key={item.period}>
                    <TableCell className="font-medium">{formatPeriod(item.period, granularity)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatDuration(item.avgMttaMs)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatDuration(item.medianMttaMs)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatDuration(item.avgMttrMs)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatDuration(item.medianMttrMs)}</TableCell>
                    <TableCell className="text-right">{item.eventCount}</TableCell>
                    <TableCell className="text-right">{item.resolvedCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
