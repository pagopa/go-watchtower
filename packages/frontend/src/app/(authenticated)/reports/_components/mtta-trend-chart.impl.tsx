'use client'

import { memo, useMemo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatDuration } from '@go-watchtower/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MttaTrendItem } from '@/lib/api-client'

const COLORS = {
  avg: 'hsl(var(--chart-1, 220 70% 50%))',
  median: 'hsl(var(--chart-2, 160 60% 45%))',
  bar: 'hsl(var(--chart-3, 30 80% 55%))',
}

function formatPeriodShort(period: string, granularity: 'weekly' | 'monthly'): string {
  const d = new Date(period + 'T00:00:00')
  if (granularity === 'monthly') {
    return d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })
  }
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
}

function msToHours(ms: number | null): number | null {
  if (ms == null) return null
  return Math.round((ms / 3_600_000) * 100) / 100
}

interface Props {
  data: MttaTrendItem[]
  granularity: 'weekly' | 'monthly'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md text-sm space-y-1">
      <p className="font-medium">{label}</p>
      {payload.map((entry: { name: string; value: number; color: string; dataKey: string }) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">
            {entry.dataKey === 'analisi'
              ? entry.value
              : formatDuration(entry.value * 3_600_000)}
          </span>
        </div>
      ))}
    </div>
  )
}

const MttaTrendChart = memo(function MttaTrendChart({ data, granularity }: Props) {
  const chartData = useMemo(() =>
    data.map((d) => ({
      period: formatPeriodShort(d.period, granularity),
      'MTTA Medio': msToHours(d.avgMttaMs),
      'MTTA Mediano': msToHours(d.medianMttaMs),
      analisi: d.analysisCount,
    })),
    [data, granularity]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trend MTTA nel tempo</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} />
            <YAxis
              yAxisId="mtta"
              allowDecimals
              tick={{ fontSize: 11 }}
              label={{ value: 'MTTA (ore)', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
            />
            <YAxis
              yAxisId="count"
              orientation="right"
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              label={{ value: 'Analisi', angle: 90, position: 'insideRight', style: { fontSize: 11 } }}
            />
            <RechartsTooltip content={<CustomTooltip />} />
            <Legend />
            <Bar
              yAxisId="count"
              dataKey="analisi"
              fill={COLORS.bar}
              name="Analisi"
              opacity={0.3}
            />
            <Line
              yAxisId="mtta"
              type="monotone"
              dataKey="MTTA Medio"
              stroke={COLORS.avg}
              strokeWidth={2}
              dot={{ r: 3 }}
              name="MTTA Medio"
            />
            <Line
              yAxisId="mtta"
              type="monotone"
              dataKey="MTTA Mediano"
              stroke={COLORS.median}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3 }}
              name="MTTA Mediano"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
})

export default MttaTrendChart
