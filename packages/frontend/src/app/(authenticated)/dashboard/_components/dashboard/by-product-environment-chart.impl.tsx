'use client'

import { useMemo, memo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AnalysisStats } from '@/lib/api-client'
import { CHART_COLORS } from './constants'

interface ByProductEnvironmentChartProps {
  data: AnalysisStats['byProductEnvironment']
}

const ByProductEnvironmentChart = memo(function ByProductEnvironmentChart({ data }: ByProductEnvironmentChartProps) {
  const { chartData, envNames } = useMemo(() => {
    const envNamesSet = new Set<string>()
    const grouped = new Map<string, Record<string, number>>()

    for (const item of data) {
      envNamesSet.add(item.environmentName)
      const entry = grouped.get(item.productName) || {}
      entry[item.environmentName] = item.count
      grouped.set(item.productName, entry)
    }

    const names = Array.from(envNamesSet)
    const result = Array.from(grouped.entries()).map(([product, envs]) => ({
      product,
      ...envs,
    }))

    return { chartData: result, envNames: names }
  }, [data])

  if (chartData.length === 0) return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Analisi per Prodotto e Ambiente</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center h-[300px]">
        <p className="text-muted-foreground">Nessun dato disponibile</p>
      </CardContent>
    </Card>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Analisi per Prodotto e Ambiente</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="product" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} />
            <RechartsTooltip />
            <Legend />
            {envNames.map((env, i) => (
              <Bar key={env} dataKey={env} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
})

export default ByProductEnvironmentChart
