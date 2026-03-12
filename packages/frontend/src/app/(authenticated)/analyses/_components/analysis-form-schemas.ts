import { useMemo } from 'react'
import { z } from 'zod'
import {
  isoToRomeLocal,
  isoToUTCLocal,
  romeLocalToISO,
  utcLocalToISO,
} from '@go-watchtower/shared'

export { isoToRomeLocal, isoToUTCLocal, romeLocalToISO, utcLocalToISO }

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
  resourceIds: z.array(z.string()).optional(),
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
    const analysisUTC = new Date(romeLocalToISO(data.analysisDate))
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

export const shortcutIgnorableSchema = z.object({
  alarmId: z.string().min(1, 'L\'allarme è obbligatorio'),
  occurrences: z.coerce.number().min(1, 'Minimo 1').optional().or(z.literal('')),
  environmentId: z.string().min(1, 'L\'ambiente è obbligatorio'),
  firstAlarmAt: z.string().min(1, 'La data del primo allarme è obbligatoria'),
  lastAlarmAt: z.string().min(1, 'La data dell\'ultimo allarme è obbligatoria'),
  ignoreReasonCode: z.string().min(1, 'Il motivo è obbligatorio'),
  ignoreDetails: z.record(z.string(), z.unknown()).optional(),
}).refine(
  (data) => {
    if (!data.firstAlarmAt || !data.lastAlarmAt) return true
    return new Date(data.lastAlarmAt + ':00.000Z') >= new Date(data.firstAlarmAt + ':00.000Z')
  },
  { message: 'La data ultimo allarme non può precedere il primo allarme', path: ['lastAlarmAt'] }
)

export type ShortcutIgnorableData = z.infer<typeof shortcutIgnorableSchema>

// ─── Date validation hook ──────────────────────────────────────────────────────

export function useDateValidation(
  firstAlarm: string,
  lastAlarm: string,
  analysisDate: string,
  futureOffsetMinutes?: number | null,
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

    if (analysisDate) {
      const analysisUTC = new Date(romeLocalToISO(analysisDate))

      // analysisDate is Rome local, firstAlarmAt is UTC — convert properly before comparing.
      if (firstAlarm) {
        const firstAlarmUTC = new Date(firstAlarm + ':00.000Z')
        if (analysisUTC < firstAlarmUTC) {
          result.analysisDateError = 'La data analisi non può precedere il primo allarme'
        }
      }

      // Block analysis date in the future (beyond NOW + offset).
      if (!result.analysisDateError && futureOffsetMinutes != null) {
        const maxAllowed = new Date(Date.now() + futureOffsetMinutes * 60_000)
        if (analysisUTC > maxAllowed) {
          result.analysisDateError = 'La data analisi non può essere nel futuro'
        }
      }
    }

    return result
  }, [firstAlarm, lastAlarm, analysisDate, futureOffsetMinutes])
}
