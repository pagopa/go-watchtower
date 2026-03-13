'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { startOfMonth } from '@go-watchtower/shared'
import type { DateRange } from 'react-day-picker'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { Skeleton } from '@/components/ui/skeleton'
import { api, type Product, type AlarmRankingItem } from '@/lib/api-client'
import { downloadCsv, downloadJson } from '@/lib/export-utils'
import { ExportMenu } from './export-menu'
import { ALL_VALUE } from '@/lib/constants'

interface AlarmRankingTabProps {
  products?: Product[]
}

export function AlarmRankingTab({ products }: AlarmRankingTabProps) {
  const [selectedProductId, setSelectedProductId] = useState('')
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: new Date(),
  })

  const filters = useMemo(() => {
    const f: Record<string, string> = {}
    if (selectedProductId) f.productId = selectedProductId
    if (dateRange?.from) f.dateFrom = dateRange.from.toISOString()
    if (dateRange?.to) f.dateTo = dateRange.to.toISOString()
    return f
  }, [selectedProductId, dateRange])

  const { data, isLoading } = useQuery<AlarmRankingItem[]>({
    queryKey: ['report-alarm-ranking', filters],
    queryFn: () => api.getAlarmRanking(filters),
  })

  const handleExportCsv = () => {
    if (!data) return
    const rows = data.map((item, i) => ({
      rank: i + 1,
      alarmName: item.alarmName,
      productName: item.productName,
      totalAnalyses: item.totalAnalyses,
      totalOccurrences: item.totalOccurrences,
    }))
    downloadCsv(rows, [
      { key: 'rank', label: '#' },
      { key: 'alarmName', label: 'Allarme' },
      { key: 'productName', label: 'Prodotto' },
      { key: 'totalAnalyses', label: 'Analisi' },
      { key: 'totalOccurrences', label: 'Occorrenze' },
    ], 'report-allarmi')
  }

  const handleExportJson = () => {
    if (!data) return
    downloadJson(data, 'report-allarmi')
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Periodo</Label>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          {dateRange && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setDateRange(undefined)}
              title="Tutti i periodi"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
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

        <div className="ml-auto">
          <ExportMenu
            onExportCsv={handleExportCsv}
            onExportJson={handleExportJson}
            disabled={!data || data.length === 0}
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Nessun dato disponibile per i filtri selezionati.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14 text-center">#</TableHead>
                <TableHead>Allarme</TableHead>
                <TableHead>Prodotto</TableHead>
                <TableHead className="text-right">Analisi</TableHead>
                <TableHead className="text-right">Occorrenze</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item, index) => (
                <TableRow key={item.alarmId}>
                  <TableCell className="text-center font-medium text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell className="font-medium">{item.alarmName}</TableCell>
                  <TableCell className="text-muted-foreground">{item.productName}</TableCell>
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
