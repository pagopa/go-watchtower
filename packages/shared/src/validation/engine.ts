import type {
  AnalysisSubject,
  ValidationRule,
  QualityRule,
  ValidationResult,
  QualityResult,
  ValidationIssue,
  QualityImprovement,
} from './types.js';
import { AUTOMATION_EXEMPT_RULE_IDS } from './automationExemptions.js';

/**
 * Regole che si applicano al subject.
 *
 * Le analisi automatiche saltano le regole-promemoria (§4.7); qualunque altra
 * provenienza — inclusa l'assenza del campo — usa l'insieme completo.
 */
function rulesFor<T extends { id: string; appliesTo?: (a: AnalysisSubject) => boolean }>(
  analysis: AnalysisSubject,
  rules: T[]
): T[] {
  const exempt = analysis.origin === 'AUTOMATIC';
  return rules.filter(
    (r) =>
      !(exempt && AUTOMATION_EXEMPT_RULE_IDS.has(r.id)) &&
      (!r.appliesTo || r.appliesTo(analysis))
  );
}

export function runValidation(
  analysis: AnalysisSubject,
  rules: ValidationRule[]
): ValidationResult {
  const applicableRules = rulesFor(analysis, rules);

  const maxWeight = applicableRules.reduce((sum, r) => sum + r.weight, 0);
  const failedRules = applicableRules.filter((r) => !r.validate(analysis));
  const lostWeight = failedRules.reduce((sum, r) => sum + r.weight, 0);

  const score =
    maxWeight === 0
      ? 100
      : Math.round(((maxWeight - lostWeight) / maxWeight) * 100);

  const issues: ValidationIssue[] = failedRules.map((r) => ({
    ruleId: r.id,
    severity: r.severity,
    message: typeof r.message === 'function' ? r.message(analysis) : r.message,
  }));

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return { score, issues, errors, warnings, isFullyValid: score === 100 };
}

export function runQuality(
  analysis: AnalysisSubject,
  rules: QualityRule[]
): QualityResult {
  const applicableRules = rulesFor(analysis, rules);

  const maxWeight = applicableRules.reduce((sum, r) => sum + r.weight, 0);
  const satisfiedRules = applicableRules.filter((r) => r.assess(analysis));
  const earnedWeight = satisfiedRules.reduce((sum, r) => sum + r.weight, 0);

  const score =
    maxWeight === 0
      ? 10
      : Math.round((earnedWeight / maxWeight) * 9) + 1;

  const unsatisfiedRules = applicableRules.filter((r) => !r.assess(analysis));

  const improvements: QualityImprovement[] = unsatisfiedRules.map((r) => ({
    ruleId: r.id,
    label: r.label,
    hint: r.hint,
  }));

  const satisfied: QualityImprovement[] = satisfiedRules.map((r) => ({
    ruleId: r.id,
    label: r.label,
    hint: r.hint,
  }));

  return {
    score,
    satisfied,
    improvements,
    satisfiedCount: satisfiedRules.length,
    totalApplicable: applicableRules.length,
  };
}
