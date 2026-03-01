import { ANALYSIS_TYPE_LABELS, ANALYSIS_STATUS_LABELS } from '@go-watchtower/shared'
import type { AnalysisStatus } from '@go-watchtower/shared'
import { formatInTimeZone } from 'date-fns-tz'

export { ANALYSIS_TYPE_LABELS, ANALYSIS_STATUS_LABELS }

const ROME_TZ = 'Europe/Rome'

export const ANALYSIS_STATUS_VARIANTS: Record<AnalysisStatus, 'default' | 'secondary' | 'outline'> = {
  CREATED: 'outline',
  IN_PROGRESS: 'secondary',
  COMPLETED: 'default',
}

// Legacy helpers — still used by some components; prefer timezone-aware variants below.
export const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

export const formatDateTime = (dateString: string) =>
  new Date(dateString).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

// ─── Timezone-aware display utilities ─────────────────────────────────────────

/**
 * Formats a UTC ISO string as date+time in the Europe/Rome timezone.
 * Use for analysisDate and any timestamp entered by the analyst (local Roma time).
 */
export const formatDateTimeRome = (isoStr: string): string => {
  if (!isoStr) return '—'
  return formatInTimeZone(new Date(isoStr), ROME_TZ, 'dd/MM/yyyy HH:mm')
}

/**
 * Formats a UTC ISO string showing pure UTC time.
 * Use for firstAlarmAt / lastAlarmAt (timestamps from monitoring, always UTC).
 */
export const formatDateTimeUTC = (isoStr: string): string => {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

export interface DualDateTime {
  utc: string
  rome: string
}

/**
 * Returns both UTC and Rome-local representations for an alarm timestamp.
 * Use in detail views where both timezones matter.
 */
export const formatDateTimeDual = (isoStr: string): DualDateTime => {
  if (!isoStr) return { utc: '—', rome: '—' }
  return {
    utc: formatDateTimeUTC(isoStr),
    rome: formatInTimeZone(new Date(isoStr), ROME_TZ, 'dd/MM/yyyy HH:mm'),
  }
}

/**
 * Computes MTTA (Mean Time To Acknowledge) as a human-readable string.
 * Both arguments must be UTC ISO strings.
 */
export const computeMTTA = (analysisDate: string, firstAlarmAt: string): string => {
  if (!analysisDate || !firstAlarmAt) return '—'
  const diffMs = new Date(analysisDate).getTime() - new Date(firstAlarmAt).getTime()
  if (diffMs < 0) return '—'
  const totalMins = Math.round(diffMs / 60_000)
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}
