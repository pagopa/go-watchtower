'use client'

import { memo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AnalysisStats } from '@/lib/api-client'
import { CHART_COLORS } from './constants'

interface ByOperatorChartProps {
  data: AnalysisStats['byOperator']
}

const ByOperatorChart = memo(function ByOperatorChart({ data }: ByOperatorChartProps) {
  if (data.length === 0) return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Analisi per Operatore</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center h-[300px]">
        <p className="text-muted-foreground">Nessun dato disponibile</p>
      </CardContent>
    </Card>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Analisi per Operatore</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="operatorName"
              width={120}
              tick={{ fontSize: 12 }}
            />
            <RechartsTooltip />
            <Bar dataKey="count" fill={CHART_COLORS[0]} name="Analisi" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
})

export default ByOperatorChart
