'use client'

import { Fragment, useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { startOfMonth } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { ChevronRight, X } from 'lucide-react'
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
import { api, type Product, type OperatorWorkloadItem } from '@/lib/api-client'
import { downloadCsv, downloadJson } from '@/lib/export-utils'
import { ExportMenu } from './export-menu'
import { formatDuration } from '../_lib/format-duration'
import { cn } from '@/lib/utils'

const ALL_VALUE = '__all__'

interface OperatorWorkloadTabProps {
  products?: Product[]
}

export function OperatorWorkloadTab({ products }: OperatorWorkloadTabProps) {
  const [selectedProductId, setSelectedProductId] = useState('')
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: new Date(),
  })
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const filters = useMemo(() => {
    const f: Record<string, string> = {}
    if (selectedProductId) f.productId = selectedProductId
    if (dateRange?.from) f.dateFrom = dateRange.from.toISOString()
    if (dateRange?.to) f.dateTo = dateRange.to.toISOString()
    return f
  }, [selectedProductId, dateRange])

  const { data, isLoading } = useQuery<OperatorWorkloadItem[]>({
    queryKey: ['report-operator-workload', filters],
    queryFn: () => api.getOperatorWorkload(filters),
  })

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleExportCsv = () => {
    if (!data) return
    const flat = data.flatMap((op) =>
      op.byEnvironment.length > 0
        ? op.byEnvironment.map((env) => ({
            operatorName: op.operatorName,
            operatorEmail: op.operatorEmail,
            environmentName: env.environmentName,
            analyses: env.count,
            onCall: env.onCallCount,
            occurrences: env.occurrences,
            mttaMs: env.mttaMs,
          }))
        : [{
            operatorName: op.operatorName,
            operatorEmail: op.operatorEmail,
            environmentName: 'Totale',
            analyses: op.totalAnalyses,
            onCall: op.onCallAnalyses,
            occurrences: op.totalOccurrences,
            mttaMs: op.mttaMs,
          }]
    )
    downloadCsv(flat, [
      { key: 'operatorName', label: 'Operatore' },
      { key: 'operatorEmail', label: 'Email' },
      { key: 'environmentName', label: 'Ambiente' },
      { key: 'analyses', label: 'Analisi' },
      { key: 'onCall', label: 'On-call' },
      { key: 'occurrences', label: 'Occorrenze' },
      { key: 'mttaMs', label: 'MTTA (ms)' },
    ], 'report-operatori')
  }

  const handleExportJson = () => {
    if (!data) return
    downloadJson(data, 'report-operatori')
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
                <TableHead className="w-10" />
                <TableHead>Operatore</TableHead>
                <TableHead className="text-right">Analisi</TableHead>
                <TableHead className="text-right">On-call</TableHead>
                <TableHead className="text-right">Occorrenze</TableHead>
                <TableHead className="text-right">MTTA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((op) => {
                const isExpanded = expandedIds.has(op.operatorId)
                const onCallPct = op.totalAnalyses > 0
                  ? Math.round((op.onCallAnalyses / op.totalAnalyses) * 100)
                  : 0

                return (
                  <Fragment key={op.operatorId}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleExpanded(op.operatorId)}
                    >
                      <TableCell className="w-10 px-2">
                        {op.byEnvironment.length > 0 && (
                          <ChevronRight
                            className={cn(
                              'h-4 w-4 transition-transform',
                              isExpanded && 'rotate-90'
                            )}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{op.operatorName}</div>
                        <div className="text-xs text-muted-foreground">{op.operatorEmail}</div>
                      </TableCell>
                      <TableCell className="text-right font-medium">{op.totalAnalyses}</TableCell>
                      <TableCell className="text-right">
                        {op.onCallAnalyses} <span className="text-muted-foreground text-xs">({onCallPct}%)</span>
                      </TableCell>
                      <TableCell className="text-right">{op.totalOccurrences}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatDuration(op.mttaMs)}</TableCell>
                    </TableRow>
                    {isExpanded && op.byEnvironment.map((env) => {
                      const envOnCallPct = env.count > 0
                        ? Math.round((env.onCallCount / env.count) * 100)
                        : 0

                      return (
                        <TableRow key={`${op.operatorId}-${env.environmentId}`} className="bg-muted/30">
                          <TableCell />
                          <TableCell className="pl-10 text-sm text-muted-foreground">
                            {env.environmentName}
                          </TableCell>
                          <TableCell className="text-right text-sm">{env.count}</TableCell>
                          <TableCell className="text-right text-sm">
                            {env.onCallCount} <span className="text-muted-foreground text-xs">({envOnCallPct}%)</span>
                          </TableCell>
                          <TableCell className="text-right text-sm">{env.occurrences}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatDuration(env.mttaMs)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
