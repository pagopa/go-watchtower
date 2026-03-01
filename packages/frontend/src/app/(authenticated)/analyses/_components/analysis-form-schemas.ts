import { useMemo } from 'react'
import { z } from 'zod'
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz'

const ROME_TZ = 'Europe/Rome'

// ─── Timezone-aware date conversion helpers ────────────────────────────────────
//
// analysisDate  → entered by the analyst as local ROME time
// firstAlarmAt  → entered as UTC (copied from monitoring dashboards)
// lastAlarmAt   → same as firstAlarmAt

/**
 * UTC ISO → "YYYY-MM-DDTHH:mm" in Europe/Rome TZ.
 * Use to pre-fill the DateTimePicker for analysisDate when editing.
 */
export const isoToRomeLocal = (iso: string): string => {
  if (!iso) return ''
  return formatInTimeZone(new Date(iso), ROME_TZ, "yyyy-MM-dd'T'HH:mm")
}

/**
 * UTC ISO → "YYYY-MM-DDTHH:mm" in UTC (strips timezone suffix).
 * Use to pre-fill the DateTimePicker for firstAlarmAt / lastAlarmAt when editing.
 */
export const isoToUTCLocal = (iso: string): string => {
  if (!iso) return ''
  return iso.slice(0, 16)
}

/**
 * "YYYY-MM-DDTHH:mm" interpreted as Europe/Rome → UTC ISO string.
 * Use when submitting analysisDate.
 */
export const romeLocalToISO = (val: string): string => {
  if (!val) return ''
  return fromZonedTime(new Date(val), ROME_TZ).toISOString()
}

/**
 * "YYYY-MM-DDTHH:mm" interpreted as UTC → UTC ISO string.
 * Use when submitting firstAlarmAt / lastAlarmAt.
 */
export const utcLocalToISO = (val: string): string => {
  if (!val) return ''
  // Append ':00.000Z' to unambiguously treat the value as UTC.
  return new Date(val + ':00.000Z').toISOString()
}

// Backward-compat aliases (used by shortcut dialogs which only deal with UTC alarm times).
export const toDatetimeLocal = isoToUTCLocal
export const fromDatetimeLocal = utcLocalToISO

// ─── Full schema ───────────────────────────────────────────────────────────────

export const analysisFormSchema = z.object({
  analysisDate: z.string().min(1, 'La data di analisi è obbligatoria'),
  firstAlarmAt: z.string().min(1, 'La data del primo allarme è obbligatoria'),
  lastAlarmAt: z.string().min(1, 'La data dell\'ultimo allarme è obbligatoria'),
  alarmId: z.string().min(1, 'L\'allarme è obbligatorio'),
  environmentId: z.string().min(1, 'L\'ambiente è obbligatorio'),
  operatorId: z.string().min(1, 'L\'operatore è obbligatorio'),
  finalActionIds: z.array(z.string()).optional(),
  analysisType: z.string().optional(),
  status: z.string().optional(),
  occurrences: z.coerce.number().min(1, 'Minimo 1').optional().or(z.literal('')),
  isOnCall: z.boolean().optional(),
  errorDetails: z.string().optional(),
  conclusionNotes: z.string().optional(),
  ignoreReasonCode: z.string().optional(),
  ignoreDetails: z.record(z.string(), z.unknown()).optional(),
  runbookId: z.string().optional(),
  microserviceIds: z.array(z.string()).optional(),
  downstreamIds: z.array(z.string()).optional(),
  links: z.array(z.object({
    url: z.string().min(1, 'URL obbligatorio'),
    name: z.string().optional(),
    type: z.string().optional(),
  })).optional(),
  trackingIds: z.array(z.object({
    traceId: z.string().min(1, 'Trace ID obbligatorio'),
    errorCode: z.string().optional(),
    errorDetail: z.string().optional(),
    timestamp: z.string().optional(),
  })).optional(),
}).refine(
  (data) => {
    if (!data.firstAlarmAt || !data.lastAlarmAt) return true
    // Both alarm dates are UTC — compare directly as UTC timestamps.
    return new Date(data.lastAlarmAt + ':00.000Z') >= new Date(data.firstAlarmAt + ':00.000Z')
  },
  { message: 'La data ultimo allarme non può precedere il primo allarme', path: ['lastAlarmAt'] }
).refine(
  (data) => {
    if (!data.analysisDate || !data.firstAlarmAt) return true
    // analysisDate is Rome local, firstAlarmAt is UTC — convert to actual UTC before comparing.
    const analysisUTC = fromZonedTime(new Date(data.analysisDate), ROME_TZ)
    const firstAlarmUTC = new Date(data.firstAlarmAt + ':00.000Z')
    return analysisUTC >= firstAlarmUTC
  },
  { message: 'La data analisi non può precedere il primo allarme', path: ['analysisDate'] }
)

export type AnalysisFormData = z.infer<typeof analysisFormSchema>

// ─── Shortcut schemas ──────────────────────────────────────────────────────────

export const shortcutInCorsoSchema = z.object({
  alarmId: z.string().min(1, 'L\'allarme è obbligatorio'),
  isOnCall: z.boolean().optional(),
  occurrences: z.coerce.number().min(1, 'Minimo 1').optional().or(z.literal('')),
  environmentId: z.string().min(1, 'L\'ambiente è obbligatorio'),
  firstAlarmAt: z.string().min(1, 'La data del primo allarme è obbligatoria'),
})

export type ShortcutInCorsoData = z.infer<typeof shortcutInCorsoSchema>

export const shortcutDisservizioSchema = z.object({
  alarmId: z.string().min(1, 'L\'allarme è obbligatorio'),
  ignoreReasonCode: z.enum(['RELEASE', 'MAINTENANCE'], {
    error: 'Il motivo è obbligatorio',
  }),
  occurrences: z.coerce.number().min(1, 'Minimo 1').optional().or(z.literal('')),
  environmentId: z.string().min(1, 'L\'ambiente è obbligatorio'),
  firstAlarmAt: z.string().min(1, 'La data del primo allarme è obbligatoria'),
  lastAlarmAt: z.string().min(1, 'La data dell\'ultimo allarme è obbligatoria'),
}).refine(
  (data) => {
    if (!data.firstAlarmAt || !data.lastAlarmAt) return true
    return new Date(data.lastAlarmAt + ':00.000Z') >= new Date(data.firstAlarmAt + ':00.000Z')
  },
  { message: 'La data ultimo allarme non può precedere il primo allarme', path: ['lastAlarmAt'] }
)

export type ShortcutDisservizioData = z.infer<typeof shortcutDisservizioSchema>

export const shortcutIgnoreListSchema = z.object({
  alarmId: z.string().min(1, 'L\'allarme è obbligatorio'),
  occurrences: z.coerce.number().min(1, 'Minimo 1').optional().or(z.literal('')),
  environmentId: z.string().min(1, 'L\'ambiente è obbligatorio'),
  firstAlarmAt: z.string().min(1, 'La data del primo allarme è obbligatoria'),
  lastAlarmAt: z.string().min(1, 'La data dell\'ultimo allarme è obbligatoria'),
}).refine(
  (data) => {
    if (!data.firstAlarmAt || !data.lastAlarmAt) return true
    return new Date(data.lastAlarmAt + ':00.000Z') >= new Date(data.firstAlarmAt + ':00.000Z')
  },
  { message: 'La data ultimo allarme non può precedere il primo allarme', path: ['lastAlarmAt'] }
)

export type ShortcutIgnoreListData = z.infer<typeof shortcutIgnoreListSchema>

export const shortcutNonGestitoSchema = z.object({
  alarmId: z.string().min(1, 'L\'allarme è obbligatorio'),
  handler: z.string().min(1, 'Il nome del team/gestore è obbligatorio'),
  occurrences: z.coerce.number().min(1, 'Minimo 1').optional().or(z.literal('')),
  environmentId: z.string().min(1, 'L\'ambiente è obbligatorio'),
  firstAlarmAt: z.string().min(1, 'La data del primo allarme è obbligatoria'),
  lastAlarmAt: z.string().min(1, 'La data dell\'ultimo allarme è obbligatoria'),
}).refine(
  (data) => {
    if (!data.firstAlarmAt || !data.lastAlarmAt) return true
    return new Date(data.lastAlarmAt + ':00.000Z') >= new Date(data.firstAlarmAt + ':00.000Z')
  },
  { message: 'La data ultimo allarme non può precedere il primo allarme', path: ['lastAlarmAt'] }
)

export type ShortcutNonGestitoData = z.infer<typeof shortcutNonGestitoSchema>

// ─── Date validation hook ──────────────────────────────────────────────────────

export function useDateValidation(
  firstAlarm: string,
  lastAlarm: string,
  analysisDate: string
) {
  return useMemo(() => {
    const result = { lastAlarmError: '', analysisDateError: '' }

    // Both alarm times are UTC — compare as UTC.
    if (firstAlarm && lastAlarm) {
      const first = new Date(firstAlarm + ':00.000Z')
      const last = new Date(lastAlarm + ':00.000Z')
      if (last < first) {
        result.lastAlarmError = 'La data ultimo allarme non può precedere il primo allarme'
      }
    }

    // analysisDate is Rome local, firstAlarmAt is UTC — convert properly before comparing.
    if (analysisDate && firstAlarm) {
      const analysisUTC = fromZonedTime(new Date(analysisDate), ROME_TZ)
      const firstAlarmUTC = new Date(firstAlarm + ':00.000Z')
      if (analysisUTC < firstAlarmUTC) {
        result.analysisDateError = 'La data analisi non può precedere il primo allarme'
      }
    }

    return result
  }, [firstAlarm, lastAlarm, analysisDate])
}
