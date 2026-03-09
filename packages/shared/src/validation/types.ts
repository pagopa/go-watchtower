import type { TrackingEntry, AnalysisLink } from '../types/analysis.js';

// Re-export so downstream importers can get them from a single place.
export type { TrackingEntry, AnalysisLink };

// ─── Input type ───────────────────────────────────────────────────────────────
// Minimo subset di campi richiesto da tutte le regole di validazione.
// Soddisfatto strutturalmente sia da AlarmAnalysis (frontend) che dall'oggetto
// costruito dal backend dalla query Prisma.

export interface NamedEntity {
  id: string
  name: string
}

export interface AnalysisSubject {
  // Campi temporali (ISO string)
  analysisDate: string
  firstAlarmAt: string
  lastAlarmAt: string

  // Campi scalari
  occurrences: number
  isOnCall: boolean
  analysisType: 'ANALYZABLE' | 'IGNORABLE'
  ignoreReasonCode: string | null
  errorDetails: string | null
  conclusionNotes: string | null

  // Relazioni (solo i campi necessari per le regole)
  runbook: { id: string } | null
  finalActions: NamedEntity[]
  resources: { id: string }[]
  downstreams: { id: string }[]
  links: AnalysisLink[]
  trackingIds: TrackingEntry[]
}

// ─── Rule types ───────────────────────────────────────────────────────────────

export type Severity = 'error' | 'warning'

export interface ValidationRule {
  id: string
  severity: Severity
  weight: number
  message: string | ((a: AnalysisSubject) => string)
  appliesTo?: (a: AnalysisSubject) => boolean
  validate: (a: AnalysisSubject) => boolean
}

export interface QualityRule {
  id: string
  weight: number
  label: string
  hint: string
  appliesTo?: (a: AnalysisSubject) => boolean
  assess: (a: AnalysisSubject) => boolean
}

// ─── Result types ─────────────────────────────────────────────────────────────

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
