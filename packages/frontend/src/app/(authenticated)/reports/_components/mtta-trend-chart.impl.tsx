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
  mttaAvg: 'hsl(var(--chart-1, 220 70% 50%))',
  mttaMedian: 'hsl(var(--chart-2, 160 60% 45%))',
  mttrAvg: 'hsl(var(--chart-4, 280 65% 55%))',
  mttrMedian: 'hsl(var(--chart-5, 340 70% 50%))',
  mttfAvg: 'hsl(var(--chart-6, 45 90% 50%))',
  mttfMedian: 'hsl(var(--chart-7, 200 80% 45%))',
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
            {entry.dataKey === 'eventi'
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
      'MTTR Medio': msToHours(d.avgMttrMs),
      'MTTR Mediano': msToHours(d.medianMttrMs),
      'MTTF Medio': msToHours(d.avgMttfMs),
      'MTTF Mediano': msToHours(d.medianMttfMs),
      eventi: d.eventCount,
    })),
    [data, granularity]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trend MTTA / MTTR / MTTF nel tempo</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} />
            <YAxis
              yAxisId="time"
              allowDecimals
              tick={{ fontSize: 11 }}
              label={{ value: 'Ore', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
            />
            <YAxis
              yAxisId="count"
              orientation="right"
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              label={{ value: 'Eventi', angle: 90, position: 'insideRight', style: { fontSize: 11 } }}
            />
            <RechartsTooltip content={<CustomTooltip />} />
            <Legend />
            <Bar
              yAxisId="count"
              dataKey="eventi"
              fill={COLORS.bar}
              name="Eventi"
              opacity={0.3}
            />
            <Line
              yAxisId="time"
              type="monotone"
              dataKey="MTTA Medio"
              stroke={COLORS.mttaAvg}
              strokeWidth={2}
              dot={{ r: 3 }}
              name="MTTA Medio"
            />
            <Line
              yAxisId="time"
              type="monotone"
              dataKey="MTTA Mediano"
              stroke={COLORS.mttaMedian}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3 }}
              name="MTTA Mediano"
            />
            <Line
              yAxisId="time"
              type="monotone"
              dataKey="MTTR Medio"
              stroke={COLORS.mttrAvg}
              strokeWidth={2}
              dot={{ r: 3 }}
              name="MTTR Medio"
            />
            <Line
              yAxisId="time"
              type="monotone"
              dataKey="MTTR Mediano"
              stroke={COLORS.mttrMedian}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3 }}
              name="MTTR Mediano"
            />
            <Line
              yAxisId="time"
              type="monotone"
              dataKey="MTTF Medio"
              stroke={COLORS.mttfAvg}
              strokeWidth={2}
              dot={{ r: 3 }}
              name="MTTF Medio"
            />
            <Line
              yAxisId="time"
              type="monotone"
              dataKey="MTTF Mediano"
              stroke={COLORS.mttfMedian}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3 }}
              name="MTTF Mediano"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
})

export default MttaTrendChart
