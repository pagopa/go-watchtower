import type { ValidationRule } from '@/lib/analysis-validation/types'

export const analyzableRules: ValidationRule[] = [
  {
    id: 'ANALYZABLE_REQUIRES_FINAL_ACTION',
    severity: 'error',
    weight: 2,
    message:
      "Un'analisi di tipo Analizzabile deve avere almeno un'azione finale",
    appliesTo: (a) => a.analysisType === 'ANALYZABLE',
    validate: (a) => a.finalActions.length > 0,
  },
  {
    id: 'ANALYZABLE_REQUIRES_MICROSERVICE',
    severity: 'error',
    weight: 2,
    message:
      "Un'analisi di tipo Analizzabile deve avere almeno un microservizio",
    appliesTo: (a) => a.analysisType === 'ANALYZABLE',
    validate: (a) => a.microservices.length > 0,
  },
  {
    id: 'EXTERNAL_TEAM_WITHOUT_NAME',
    severity: 'error',
    weight: 2,
    message:
      'Per un\'analisi non gestita internamente è necessario specificare il team esterno',
    appliesTo: (a) => a.analysisType === 'IGNORED_NOT_MANAGED',
    validate: (a) =>
      a.externalTeamName != null && a.externalTeamName.trim() !== '',
  },
]
