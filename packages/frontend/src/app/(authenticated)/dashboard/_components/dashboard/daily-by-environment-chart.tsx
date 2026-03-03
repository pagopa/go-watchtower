'use client'

import { useMemo, memo } from 'react'
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, ComposedChart, Line,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AnalysisStats } from '@/lib/api-client'
import { CHART_COLORS, formatDay } from './constants'

interface DailyByEnvironmentChartProps {
  data: AnalysisStats['dailyByEnvironment']
}

export const DailyByEnvironmentChart = memo(function DailyByEnvironmentChart({ data }: DailyByEnvironmentChartProps) {
  const { chartData, envNames } = useMemo(() => {
    const envNamesSet = new Set<string>()
    const grouped = new Map<string, Record<string, number>>()

    for (const item of data) {
      envNamesSet.add(item.environmentName)
      const entry = grouped.get(item.date) || {}
      entry[item.environmentName] = (entry[item.environmentName] || 0) + item.count
      entry['_occorrenze'] = (entry['_occorrenze'] || 0) + item.totalOccurrences
      grouped.set(item.date, entry)
    }

    const names = Array.from(envNamesSet)
    const result = Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, envs]) => {
        const { _occorrenze, ...rest } = envs
        return {
          date: formatDay(date),
          ...rest,
          Occorrenze: _occorrenze || 0,
        }
      })

    return { chartData: result, envNames: names }
  }, [data])

  if (chartData.length === 0) return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Analisi Giornaliere per Ambiente</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center h-[300px]">
        <p className="text-muted-foreground">Nessun dato disponibile</p>
      </CardContent>
    </Card>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Analisi Giornaliere per Ambiente</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} />
            <RechartsTooltip />
            <Legend />
            {envNames.map((env, i) => (
              <Bar key={env} dataKey={env} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
            <Line
              type="monotone"
              dataKey="Occorrenze"
              stroke={CHART_COLORS[4]}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
})
