'use client'

import { memo } from 'react'
import { ANALYSIS_STATUS_LABELS, ANALYSIS_TYPE_LABELS } from '@go-watchtower/shared'
import type { AnalysisStatus, AnalysisType } from '@go-watchtower/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { AlarmDetailData } from '@/lib/api-client'

interface Props {
  data: AlarmDetailData['recentAnalyses']
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  COMPLETED: 'default',
  IN_PROGRESS: 'secondary',
  CREATED: 'outline',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const RecentAnalysesTable = memo(function RecentAnalysesTable({ data }: Props) {
  if (data.length === 0) return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ultime Analisi</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center h-[200px]">
        <p className="text-muted-foreground">Nessuna analisi trovata</p>
      </CardContent>
    </Card>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ultime Analisi</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Operatore</TableHead>
              <TableHead>Ambiente</TableHead>
              <TableHead className="text-right">Occ.</TableHead>
              <TableHead className="hidden lg:table-cell">Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="whitespace-nowrap text-sm">
                  {formatDate(a.analysisDate)}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[a.status] || 'outline'}>
                    {ANALYSIS_STATUS_LABELS[a.status as AnalysisStatus] || a.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {ANALYSIS_TYPE_LABELS[a.analysisType as AnalysisType] || a.analysisType}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{a.operatorName}</TableCell>
                <TableCell className="text-sm">{a.environmentName}</TableCell>
                <TableCell className="text-right text-sm">{a.occurrences}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                  {a.conclusionNotes || '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
})
