import type { ValidationRule } from '@/lib/analysis-validation/types'

const SEVEN_DAYS_MS = 604_800_000
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000

export const datesRules: ValidationRule[] = [
  // ── Errors (weight: 2) ──────────────────────────────────────────────
  {
    id: 'ANALYSIS_DATE_AFTER_FIRST_ALARM',
    severity: 'error',
    weight: 2,
    message: 'La data analisi deve essere successiva alla data del primo allarme',
    validate: (a) => new Date(a.analysisDate) > new Date(a.firstAlarmAt),
  },
  {
    id: 'ANALYSIS_DATE_NOT_FUTURE',
    severity: 'error',
    weight: 2,
    message: 'La data analisi non può essere nel futuro',
    validate: (a) => new Date(a.analysisDate) <= new Date(),
  },
  {
    id: 'ALARM_CHRONOLOGY',
    severity: 'error',
    weight: 2,
    message:
      'La data del primo allarme deve essere precedente o uguale alla data dell\'ultimo allarme',
    validate: (a) => new Date(a.firstAlarmAt) <= new Date(a.lastAlarmAt),
  },
  {
    id: 'ALARM_DATES_NOT_FUTURE',
    severity: 'error',
    weight: 2,
    message: 'Le date degli allarmi non possono essere nel futuro',
    validate: (a) => {
      const now = new Date()
      return new Date(a.firstAlarmAt) <= now && new Date(a.lastAlarmAt) <= now
    },
  },
  {
    id: 'MTTA_NEGATIVE',
    severity: 'error',
    weight: 2,
    message: "L'MTTA risulta negativo: la data analisi precede il primo allarme",
    validate: (a) =>
      new Date(a.analysisDate).getTime() - new Date(a.firstAlarmAt).getTime() >= 0,
  },
  {
    id: 'OCCURRENCES_POSITIVE',
    severity: 'error',
    weight: 2,
    message: 'Il numero di occorrenze deve essere almeno 1',
    validate: (a) => a.occurrences >= 1,
  },

  // ── Warnings (weight: 1) ────────────────────────────────────────────
  {
    id: 'MTTA_UNREALISTIC',
    severity: 'warning',
    weight: 1,
    message: "L'MTTA supera i 7 giorni, verifica le date inserite",
    appliesTo: (a) =>
      !isNaN(new Date(a.analysisDate).getTime()) &&
      !isNaN(new Date(a.firstAlarmAt).getTime()),
    validate: (a) =>
      new Date(a.analysisDate).getTime() - new Date(a.firstAlarmAt).getTime() <=
      SEVEN_DAYS_MS,
  },
  {
    id: 'ALARM_WINDOW_TOO_LONG',
    severity: 'warning',
    weight: 1,
    message: 'La finestra temporale degli allarmi supera i 30 giorni',
    validate: (a) =>
      new Date(a.lastAlarmAt).getTime() - new Date(a.firstAlarmAt).getTime() <=
      THIRTY_DAYS_MS,
  },
  {
    id: 'ANALYSIS_DATE_TOO_OLD',
    severity: 'warning',
    weight: 1,
    message: 'La data analisi è molto vecchia (più di 6 mesi fa)',
    validate: (a) =>
      Date.now() - new Date(a.analysisDate).getTime() <= SIX_MONTHS_MS,
  },
  {
    id: 'SAME_FIRST_LAST_ALARM',
    severity: 'warning',
    weight: 1,
    message:
      'Con più occorrenze, primo e ultimo allarme non dovrebbero coincidere',
    appliesTo: (a) => a.occurrences > 1,
    validate: (a) => a.firstAlarmAt !== a.lastAlarmAt,
  },
]
