'use client'

import { memo } from 'react'
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, ComposedChart, Line,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AlarmDetailData } from '@/lib/api-client'

const COLORS = {
  bar: 'hsl(var(--chart-1, 220 70% 50%))',
  line: 'hsl(var(--chart-5, 340 75% 55%))',
}

function formatDay(date: string): string {
  const d = new Date(date + 'T00:00:00')
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
}

interface Props {
  data: AlarmDetailData['occurrenceTrend']
}

const OccurrenceTrendChart = memo(function OccurrenceTrendChart({ data }: Props) {
  if (data.length === 0) return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trend Occorrenze</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center h-[300px]">
        <p className="text-muted-foreground">Nessun dato disponibile</p>
      </CardContent>
    </Card>
  )

  const chartData = data.map((d) => ({
    date: formatDay(d.date),
    Analisi: d.count,
    Occorrenze: d.occurrences,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trend Occorrenze</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} />
            <RechartsTooltip />
            <Legend />
            <Bar dataKey="Analisi" fill={COLORS.bar} />
            <Line
              type="monotone"
              dataKey="Occorrenze"
              stroke={COLORS.line}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
})

export default OccurrenceTrendChart
