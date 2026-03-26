'use client'

import { memo } from 'react'
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

interface AssociationTableProps {
  title: string
  items: Array<{ id: string; name: string; count: number }>
}

function AssociationTable({ title, items }: AssociationTableProps) {
  if (items.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="text-right w-24">Analisi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="text-sm font-medium">{item.name}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary">{item.count}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

interface IgnoredAlarmsSectionProps {
  data: AlarmDetailData['ignoredAlarms']
}

function IgnoredAlarmsSection({ data }: IgnoredAlarmsSectionProps) {
  if (data.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Regole di Esclusione</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ambiente</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead className="w-24">Stato</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((ia) => (
              <TableRow key={ia.id}>
                <TableCell className="text-sm font-medium">{ia.environmentName}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{ia.reason || '—'}</TableCell>
                <TableCell>
                  <Badge variant={ia.isActive ? 'default' : 'secondary'}>
                    {ia.isActive ? 'Attiva' : 'Inattiva'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

interface AlarmAssociationsProps {
  topResources: AlarmDetailData['topResources']
  topDownstreams: AlarmDetailData['topDownstreams']
  ignoredAlarms: AlarmDetailData['ignoredAlarms']
}

export const AlarmAssociations = memo(function AlarmAssociations({
  topResources,
  topDownstreams,
  ignoredAlarms,
}: AlarmAssociationsProps) {
  const resourceItems = topResources.map((r) => ({ id: r.resourceId, name: r.resourceName, count: r.count }))
  const downstreamItems = topDownstreams.map((d) => ({ id: d.downstreamId, name: d.downstreamName, count: d.count }))

  const hasContent = resourceItems.length > 0 || downstreamItems.length > 0 || ignoredAlarms.length > 0

  if (!hasContent) return null

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <AssociationTable title="Risorse Coinvolte" items={resourceItems} />
      <AssociationTable title="Downstream Coinvolti" items={downstreamItems} />
      <IgnoredAlarmsSection data={ignoredAlarms} />
    </div>
  )
})
