import type { AlarmAnalysis } from '@/lib/api-client'

/** Partition by split timestamp (for the on-call view). */
export function partitionShiftAnalyses(
  analyses: AlarmAnalysis[],
  splitAt: string | null,
): { oncall: AlarmAnalysis[]; work: AlarmAnalysis[] } {
  if (splitAt === null) return { oncall: analyses, work: [] }
  const splitMs = new Date(splitAt).getTime()
  const oncall: AlarmAnalysis[] = []
  const work:   AlarmAnalysis[] = []
  for (const a of analyses) {
    if (new Date(a.analysisDate).getTime() < splitMs) oncall.push(a)
    else work.push(a)
  }
  return { oncall, work }
}
