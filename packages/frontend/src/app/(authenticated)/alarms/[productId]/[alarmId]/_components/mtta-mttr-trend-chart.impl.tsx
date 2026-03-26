'use client'

import { memo, useMemo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatDuration } from '@go-watchtower/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const COLORS = {
  mtta: 'hsl(var(--chart-1, 220 70% 50%))',
  mttr: 'hsl(var(--chart-4, 280 65% 55%))',
  bar: 'hsl(var(--chart-3, 30 80% 55%))',
}

function msToHours(ms: number | null): number | null {
  if (ms == null) return null
  return Math.round((ms / 3_600_000) * 100) / 100
}

interface Props {
  data: Array<{
    date: string
    avgMttaMs: number | null
    avgMttrMs: number | null
    eventCount: number
  }>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const d = new Date(label + 'T00:00:00')
  const formatted = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md text-sm space-y-1">
      <p className="font-medium">{formatted}</p>
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

const MttaMttrTrendChart = memo(function MttaMttrTrendChart({ data }: Props) {
  const chartData = useMemo(() =>
    data.map((d) => {
      const dt = new Date(d.date + 'T00:00:00')
      return {
        date: d.date,
        label: dt.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
        'MTTA Medio': msToHours(d.avgMttaMs),
        'MTTR Medio': msToHours(d.avgMttrMs),
        eventi: d.eventCount,
      }
    }),
    [data]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trend MTTA / MTTR giornaliero</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
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
              stroke={COLORS.mtta}
              strokeWidth={2}
              dot={{ r: 2 }}
              name="MTTA Medio"
            />
            <Line
              yAxisId="time"
              type="monotone"
              dataKey="MTTR Medio"
              stroke={COLORS.mttr}
              strokeWidth={2}
              dot={{ r: 2 }}
              name="MTTR Medio"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
})

export default MttaMttrTrendChart
