'use client'

import { Fragment, useState } from 'react'
import { ChevronRight, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import type { OperatorWorkloadItem } from '@/lib/api-client'
import { downloadCsv, downloadJson } from '@/lib/export-utils'
import { formatDuration } from '../_lib/format-duration'
import { cn } from '@/lib/utils'

interface OperatorWorkloadTabProps {
  data: OperatorWorkloadItem[] | undefined
  isLoading: boolean
}

export function OperatorWorkloadTab({ data, isLoading }: OperatorWorkloadTabProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

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

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (!data || data.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">Nessun dato disponibile per i filtri selezionati.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleExportCsv}>
          <Download className="mr-2 h-4 w-4" />
          CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportJson}>
          <Download className="mr-2 h-4 w-4" />
          JSON
        </Button>
      </div>

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
    </div>
  )
}
