import type { WorkingHours, OnCallHours } from '@go-watchtower/shared'
import type { AlarmEvent } from '@/lib/api-client'
import { shiftDay, localDayBoundsUTC } from './date-utils'

/** ISO weekday (1=Mon … 7=Sun) from a YYYY-MM-DD string, using UTC noon. */
function isoWeekdayOfDate(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!, 12))
  const jsDay = date.getUTCDay()
  return jsDay === 0 ? 7 : jsDay
}

/**
 * Converte "YYYY-MM-DD HH:MM" nell'ora locale della timezone `tz` in un istante UTC.
 * Usa il noon UTC dello stesso giorno per stimare l'offset (preciso per offset fissi
 * e per la maggior parte dei casi DST).
 */
function localTimeToUTC(dateStr: string, timeHHMM: string, tz: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [th, tm]   = timeHHMM.split(':').map(Number)
  const noonUTC    = new Date(Date.UTC(y!, mo! - 1, d!, 12))
  const parts      = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(noonUTC)
  const lh       = Number(parts.find((p) => p.type === 'hour')?.value   ?? 12)
  const lm       = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  const offsetMs = ((lh * 60 + lm) - 12 * 60) * 60_000
  return new Date(Date.UTC(y!, mo! - 1, d!, th!, tm!, 0) - offsetMs).toISOString()
}

/**
 * Returns true if `dateStr` is a full-oncall (weekend) day.
 * Uses allDay.startDay/endDay if configured; falls back to Sat (6) / Sun (7).
 * The endDay itself is NOT "full day" (it terminates at endTime via overnight).
 */
export function isOnCallAllDay(dateStr: string, oc: OnCallHours | null): boolean {
  const isoDay = isoWeekdayOfDate(dateStr)

  if (oc?.allDay) {
    const { startDay, endDay } = oc.allDay
    if (startDay <= endDay) {
      // Non-wrapping range (e.g. 6–7): include start up to but not including end
      return isoDay >= startDay && isoDay < endDay
    }
    // Wrapping range (e.g. startDay=6, endDay=1): Sat, Sun — but NOT Mon
    return isoDay >= startDay || isoDay < endDay
  }

  return isoDay === 6 || isoDay === 7
}

interface ShiftRange {
  dateFrom:       string
  dateTo:         string
  splitAt:        string | null
  overnightStart: string
  overnightEnd:   string
  workEnd:        string
}

export function buildShiftRange(
  referenceDate: string,
  wh: WorkingHours,
  oc: OnCallHours | null,
  allDay: boolean,
): ShiftRange {
  const tz             = oc?.timezone ?? wh.timezone ?? 'Europe/Rome'
  const overnightStart = oc?.overnight?.start ?? '18:00'
  const overnightEnd   = oc?.overnight?.end   ?? '09:00'
  const workEnd        = wh.end

  if (allDay) {
    const { dateFrom, dateTo } = localDayBoundsUTC(referenceDate, tz)
    return {
      dateFrom,
      dateTo,
      splitAt:  null,
      overnightStart,
      overnightEnd,
      workEnd,
    }
  }

  const prevDate = shiftDay(referenceDate, -1)
  return {
    dateFrom: localTimeToUTC(prevDate,       overnightStart, tz),
    dateTo:   localTimeToUTC(referenceDate,  workEnd,        tz),
    splitAt:  localTimeToUTC(referenceDate,  overnightEnd,   tz),
    overnightStart,
    overnightEnd,
    workEnd,
  }
}

export function partitionShiftEvents(
  events: AlarmEvent[],
  splitAt: string | null,
): { oncall: AlarmEvent[]; work: AlarmEvent[] } {
  if (splitAt === null) return { oncall: events, work: [] }
  const splitMs = new Date(splitAt).getTime()
  const oncall: AlarmEvent[] = []
  const work:   AlarmEvent[] = []
  for (const e of events) {
    if (new Date(e.firedAt).getTime() < splitMs) oncall.push(e)
    else work.push(e)
  }
  return { oncall, work }
}
