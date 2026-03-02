import type { AnalysisSubject, ValidationResult, QualityResult } from './types.js';
import { runValidation, runQuality } from './engine.js';
import { datesRules } from './rules/validity/dates.js';
import { analyzableRules } from './rules/validity/analyzable.js';
import { trackingRules } from './rules/validity/tracking.js';
import { finalActionRules } from './rules/validity/final-actions.js';
import { linksRules } from './rules/validity/links.js';
import { coherenceRules } from './rules/validity/coherence.js';
import { documentationRules } from './rules/quality/documentation.js';

export const ALL_VALIDITY_RULES = [
  ...datesRules,
  ...analyzableRules,
  ...trackingRules,
  ...finalActionRules,
  ...linksRules,
  ...coherenceRules,
];

export const ALL_QUALITY_RULES = [...documentationRules];

export function validateAnalysis(analysis: AnalysisSubject): ValidationResult {
  return runValidation(analysis, ALL_VALIDITY_RULES);
}

export function assessQuality(analysis: AnalysisSubject): QualityResult {
  return runQuality(analysis, ALL_QUALITY_RULES);
}

export type {
  AnalysisSubject,
  NamedEntity,
  ValidationResult,
  QualityResult,
  ValidationIssue,
  QualityImprovement,
  ValidationRule,
  QualityRule,
  Severity,
} from './types.js';
