'use client'

import { useMemo, memo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AnalysisStats } from '@/lib/api-client'
import { CHART_COLORS, formatMonth } from './constants'

interface OnCallTrendChartProps {
  data: AnalysisStats['onCallTrend']
}

export const OnCallTrendChart = memo(function OnCallTrendChart({ data }: OnCallTrendChartProps) {
  const chartData = useMemo(() =>
    data.map((item) => ({
      ...item,
      month: formatMonth(item.month),
    })),
    [data]
  )

  if (chartData.length === 0) return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trend On-Call vs Normale</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center h-[300px]">
        <p className="text-muted-foreground">Nessun dato disponibile</p>
      </CardContent>
    </Card>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trend On-Call vs Normale</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} />
            <RechartsTooltip />
            <Legend />
            <Bar dataKey="normal" name="Normale" fill={CHART_COLORS[1]} />
            <Bar dataKey="onCall" name="Reperibilita" fill={CHART_COLORS[3]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
})
