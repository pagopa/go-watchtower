import type {
  AnalysisSubject,
  ValidationRule,
  QualityRule,
  ValidationResult,
  QualityResult,
  ValidationIssue,
  QualityImprovement,
} from './types.js';

export function runValidation(
  analysis: AnalysisSubject,
  rules: ValidationRule[]
): ValidationResult {
  const applicableRules = rules.filter(
    (r) => !r.appliesTo || r.appliesTo(analysis)
  );

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
  const applicableRules = rules.filter(
    (r) => !r.appliesTo || r.appliesTo(analysis)
  );

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
