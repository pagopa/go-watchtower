'use client'

import { memo } from 'react'
import Link from 'next/link'
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
import type { AnalysisStats } from '@/lib/api-client'

interface TopAlarmsTableProps {
  data: AnalysisStats['topAlarms']
}

export const TopAlarmsTable = memo(function TopAlarmsTable({ data }: TopAlarmsTableProps) {
  if (data.length === 0) return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top 10 Allarmi</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center h-[300px]">
        <p className="text-muted-foreground">Nessun dato disponibile</p>
      </CardContent>
    </Card>
  )

  const maxCount = data[0]?.count || 1

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top 10 Allarmi</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Allarme</TableHead>
              <TableHead className="text-right w-24">Conteggio</TableHead>
              <TableHead className="w-32"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((alarm, i) => (
              <TableRow key={alarm.alarmId}>
                <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-medium">
                  <Link
                    href={`/alarms/${alarm.productId}/${alarm.alarmId}`}
                    className="hover:underline hover:text-primary transition-colors"
                  >
                    {alarm.alarmName}
                  </Link>
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary">{alarm.count}</Badge>
                </TableCell>
                <TableCell>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(alarm.count / maxCount) * 100}%` }}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
})
