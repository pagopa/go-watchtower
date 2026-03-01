import type { AnalysisType } from '@/lib/api-client'

export const ANALYSIS_TYPE_LABELS: Record<AnalysisType, string> = {
  ANALYZABLE: 'Analizzabile',
  IGNORABLE:  'Da ignorare',
}

export const CHART_COLORS = [
  'hsl(var(--chart-1, 220 70% 50%))',
  'hsl(var(--chart-2, 160 60% 45%))',
  'hsl(var(--chart-3, 30 80% 55%))',
  'hsl(var(--chart-4, 280 65% 60%))',
  'hsl(var(--chart-5, 340 75% 55%))',
]

export const PIE_COLORS = ['#3b82f6', '#f97316', '#8b5cf6', '#06b6d4', '#ef4444']

export function formatMonth(month: string): string {
  const [year, m] = month.split('-')
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
  return `${months[parseInt(m, 10) - 1]} ${year}`
}

export function formatDay(date: string): string {
  const d = new Date(date + 'T00:00:00')
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
}
