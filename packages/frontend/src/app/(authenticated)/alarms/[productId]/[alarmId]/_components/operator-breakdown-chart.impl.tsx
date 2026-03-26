'use client'

import { memo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AlarmDetailData } from '@/lib/api-client'

interface Props {
  data: AlarmDetailData['byOperator']
}

const OperatorBreakdownChart = memo(function OperatorBreakdownChart({ data }: Props) {
  if (data.length === 0) return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Per Operatore</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center h-[300px]">
        <p className="text-muted-foreground">Nessun dato disponibile</p>
      </CardContent>
    </Card>
  )

  const chartData = data.map((d) => ({
    name: d.operatorName,
    Analisi: d.analysisCount,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Per Operatore</CardTitle>
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
            <Bar dataKey="Analisi" fill="hsl(var(--chart-3, 30 80% 55%))" name="Analisi" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
})

export default OperatorBreakdownChart
