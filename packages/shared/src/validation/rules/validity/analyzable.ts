import type { ValidationRule } from '../../types.js';

export const analyzableRules: ValidationRule[] = [
  {
    id: 'ANALYZABLE_REQUIRES_FINAL_ACTION',
    severity: 'error',
    weight: 2,
    message: "Un'analisi di tipo Analizzabile deve avere almeno un'azione finale",
    appliesTo: (a) => a.analysisType === 'ANALYZABLE',
    validate: (a) => a.finalActions.length > 0,
  },
  {
    id: 'ANALYZABLE_REQUIRES_RESOURCE',
    severity: 'error',
    weight: 2,
    message: "Un'analisi di tipo Analizzabile deve avere almeno una risorsa",
    appliesTo: (a) => a.analysisType === 'ANALYZABLE',
    validate: (a) => a.resources.length > 0,
  },
  {
    id: 'IGNORABLE_REQUIRES_REASON',
    severity: 'error',
    weight: 2,
    message: "Un'analisi da ignorare deve avere un motivo specificato",
    appliesTo: (a) => a.analysisType === 'IGNORABLE',
    validate: (a) => a.ignoreReasonCode != null && a.ignoreReasonCode.trim() !== '',
  },
];
