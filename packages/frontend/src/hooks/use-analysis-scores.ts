'use client'

import { useMemo } from 'react'
import type { AlarmAnalysis } from '@/lib/api-client'
import { validateAnalysis, assessQuality } from '@/lib/analysis-validation'
import type { ValidationResult, QualityResult } from '@/lib/analysis-validation'

export function useAnalysisScores(analysis: AlarmAnalysis | null): {
  validation: ValidationResult | null
  quality: QualityResult | null
} {
  const validation = useMemo(
    () => (analysis ? validateAnalysis(analysis) : null),
    [analysis]
  )

  const quality = useMemo(
    () => (analysis ? assessQuality(analysis) : null),
    [analysis]
  )

  return { validation, quality }
}
