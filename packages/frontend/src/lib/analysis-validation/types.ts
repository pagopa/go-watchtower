import type { AlarmAnalysis } from '@/lib/api-client'

export type Severity = 'error' | 'warning'

export interface ValidationRule {
  id: string
  severity: Severity
  weight: number
  message: string | ((a: AlarmAnalysis) => string)
  appliesTo?: (a: AlarmAnalysis) => boolean
  validate: (a: AlarmAnalysis) => boolean
}

export interface QualityRule {
  id: string
  weight: number
  label: string
  hint: string
  appliesTo?: (a: AlarmAnalysis) => boolean
  assess: (a: AlarmAnalysis) => boolean
}

export interface ValidationIssue {
  ruleId: string
  severity: Severity
  message: string
}

export interface QualityImprovement {
  ruleId: string
  label: string
  hint: string
}

export interface ValidationResult {
  score: number
  issues: ValidationIssue[]
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  isFullyValid: boolean
}

export interface QualityResult {
  score: number
  satisfied: QualityImprovement[]
  improvements: QualityImprovement[]
  satisfiedCount: number
  totalApplicable: number
}
