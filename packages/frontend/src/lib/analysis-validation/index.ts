import type { AlarmAnalysis } from '@/lib/api-client'
import type { ValidationResult, QualityResult } from './types'
import { runValidation, runQuality } from './engine'
import { datesRules } from './rules/validity/dates'
import { analyzableRules } from './rules/validity/analyzable'
import { trackingRules } from './rules/validity/tracking'
import { finalActionRules } from './rules/validity/final-actions'
import { linksRules } from './rules/validity/links'
import { coherenceRules } from './rules/validity/coherence'
import { documentationRules } from './rules/quality/documentation'

export const ALL_VALIDITY_RULES = [
  ...datesRules,
  ...analyzableRules,
  ...trackingRules,
  ...finalActionRules,
  ...linksRules,
  ...coherenceRules,
]

export const ALL_QUALITY_RULES = [...documentationRules]

export function validateAnalysis(analysis: AlarmAnalysis): ValidationResult {
  return runValidation(analysis, ALL_VALIDITY_RULES)
}

export function assessQuality(analysis: AlarmAnalysis): QualityResult {
  return runQuality(analysis, ALL_QUALITY_RULES)
}

export type {
  ValidationResult,
  QualityResult,
  ValidationIssue,
  QualityImprovement,
  ValidationRule,
  QualityRule,
} from './types'
