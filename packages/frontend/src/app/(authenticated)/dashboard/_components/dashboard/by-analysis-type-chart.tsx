'use client'

import { useMemo, memo } from 'react'
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AnalysisStats } from '@/lib/api-client'
import { ANALYSIS_TYPE_LABELS, PIE_COLORS } from './constants'

interface ByAnalysisTypeChartProps {
  data: AnalysisStats['byAnalysisType']
}

export const ByAnalysisTypeChart = memo(function ByAnalysisTypeChart({ data }: ByAnalysisTypeChartProps) {
  const chartData = useMemo(() =>
    data.map((item) => ({
      name: ANALYSIS_TYPE_LABELS[item.analysisType],
      value: item.count,
    })),
    [data]
  )

  if (chartData.length === 0) return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Distribuzione per Tipo Analisi</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center h-[300px]">
        <p className="text-muted-foreground">Nessun dato disponibile</p>
      </CardContent>
    </Card>
  )

  const total = chartData.reduce((sum, d) => sum + d.value, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Distribuzione per Tipo Analisi</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
              labelLine={false}
            >
              {chartData.map((entry, i) => (
                <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <RechartsTooltip
              formatter={(value) => [`${value} (${((Number(value) / total) * 100).toFixed(1)}%)`, 'Analisi']}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
})
