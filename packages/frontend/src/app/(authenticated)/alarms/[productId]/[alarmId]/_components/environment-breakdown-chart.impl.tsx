'use client'

import { memo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AlarmDetailData } from '@/lib/api-client'

const COLORS = {
  analyses: 'hsl(var(--chart-1, 220 70% 50%))',
  occurrences: 'hsl(var(--chart-2, 160 60% 45%))',
}

interface Props {
  data: AlarmDetailData['byEnvironment']
}

const EnvironmentBreakdownChart = memo(function EnvironmentBreakdownChart({ data }: Props) {
  if (data.length === 0) return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Per Ambiente</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center h-[300px]">
        <p className="text-muted-foreground">Nessun dato disponibile</p>
      </CardContent>
    </Card>
  )

  const chartData = data.map((d) => ({
    name: d.environmentName,
    Analisi: d.analysisCount,
    Occorrenze: d.occurrences,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Per Ambiente</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fontSize: 12 }}
            />
            <RechartsTooltip />
            <Legend />
            <Bar dataKey="Analisi" fill={COLORS.analyses} />
            <Bar dataKey="Occorrenze" fill={COLORS.occurrences} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
})

export default EnvironmentBreakdownChart
