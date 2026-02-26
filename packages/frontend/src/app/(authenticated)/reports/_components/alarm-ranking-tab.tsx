'use client'

import { Download } from 'lucide-react'
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
import type { AlarmRankingItem } from '@/lib/api-client'
import { downloadCsv, downloadJson } from '@/lib/export-utils'

interface AlarmRankingTabProps {
  data: AlarmRankingItem[] | undefined
  isLoading: boolean
}

export function AlarmRankingTab({ data, isLoading }: AlarmRankingTabProps) {
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
    </div>
  )
}
