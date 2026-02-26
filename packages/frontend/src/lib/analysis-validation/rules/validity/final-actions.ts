import type { ValidationRule } from '@/lib/analysis-validation/types'

export const finalActionRules: ValidationRule[] = [
  {
    id: 'DOUBT_ACTION_REQUIRES_NOTES_AND_LINK',
    severity: 'error',
    weight: 2,
    message:
      "L'azione 'Ho dubbi sulla criticità' richiede una nota conclusiva e almeno un link",
    appliesTo: (a) =>
      a.finalActions.some((fa) =>
        fa.name.includes('Ho dubbi sulla criticità')
      ),
    validate: (a) =>
      a.conclusionNotes != null &&
      a.conclusionNotes.trim() !== '' &&
      a.links.length > 0,
  },
  {
    id: 'ESCALATION_REQUIRES_NOTES',
    severity: 'error',
    weight: 2,
    message: "L'azione di escalation richiede una nota conclusiva",
    appliesTo: (a) =>
      a.finalActions.some((fa) =>
        fa.name.includes('richiede una escalation')
      ),
    validate: (a) =>
      a.conclusionNotes != null && a.conclusionNotes.trim() !== '',
  },
]
