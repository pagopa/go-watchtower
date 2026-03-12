import type { WorkingHours } from '../types/working-hours.js';
import type { OnCallHours } from '../types/on-call-hours.js';
import { getLocalParts } from './dates.js';

export type EventClass = 'PRE' | 'WORK' | 'POST' | 'ON_CALL';

/** Converte "HH:MM" in minuti dall'inizio della giornata. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Classifica un evento in base alla finestra oraria lavorativa e all'orario di reperibilità.
 *
 * Priorità: WORK → ON_CALL → PRE / POST
 */
export function classifyEvent(
  firedAt:  Date,
  wh:       WorkingHours,
  onCall:   OnCallHours | null,
): EventClass {
  const tz      = onCall?.timezone ?? 'UTC';
  const whTz    = 'UTC'; // working hours sono sempre in UTC (minuti del giorno UTC)

  // ── Classificazione WORK ─────────────────────────────────────────────────
  // working_hours usa UTC: usiamo minuteOfDay UTC + isoWeekday UTC
  const utcFmt     = new Intl.DateTimeFormat('en-US', {
    timeZone: whTz,
    weekday:  'short',
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
  });
  const utcParts = utcFmt.formatToParts(firedAt);
  const utcGet   = (type: string) => utcParts.find((p) => p.type === type)?.value ?? '';
  const utcHour  = parseInt(utcGet('hour'),   10);
  const utcMin   = parseInt(utcGet('minute'), 10);
  const utcMoD   = utcHour * 60 + utcMin;

  const whWeekdayMap: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  };
  const utcWeekday = whWeekdayMap[utcGet('weekday')] ?? 1;

  const whStart = toMinutes(wh.start);
  const whEnd   = toMinutes(wh.end);

  const isWorkDay  = wh.days.includes(utcWeekday);
  const isWorkTime = utcMoD >= whStart && utcMoD < whEnd;

  if (isWorkDay && isWorkTime) return 'WORK';

  // ── Classificazione ON_CALL ───────────────────────────────────────────────
  if (onCall) {
    const lp = getLocalParts(firedAt, tz);
    const isoWeekday = lp.isoWeekday;
    const minuteOfDay = lp.hour * 60 + lp.minute;

    // Turno notturno feriale (overnight): inizia a `start` e termina a `end` del giorno dopo
    if (onCall.overnight) {
      const { start, end, days } = onCall.overnight;
      const oStart = toMinutes(start);
      const oEnd   = toMinutes(end);

      // Il turno INIZIA oggi (minuteOfDay >= oStart)
      if (days.includes(isoWeekday) && minuteOfDay >= oStart) return 'ON_CALL';

      // Il turno è terminato OGGI (giorno successivo, minuteOfDay < oEnd)
      // Calcola il giorno precedente ISO (wrapping 1-7)
      const prevDay = isoWeekday === 1 ? 7 : isoWeekday - 1;
      if (days.includes(prevDay) && minuteOfDay < oEnd) return 'ON_CALL';
    }

    // Turno multi-giorno / weekend (allDay)
    if (onCall.allDay) {
      const { startDay, endDay, endTime } = onCall.allDay;
      const allDayEnd = toMinutes(endTime);

      // Caso: startDay < endDay (es. Sab=6 → Lun=1 attraversa il fine settimana)
      // Tratta come range ciclico: [startDay, ..., 7, 1, ..., endDay]
      const inRange = (day: number): boolean => {
        if (startDay <= endDay) {
          return day >= startDay && day <= endDay;
        }
        // range con wrap (es. 6-1: Sab Dom Lun)
        return day >= startDay || day <= endDay;
      };

      if (inRange(isoWeekday)) {
        if (isoWeekday === endDay) {
          // Giorno di fine: solo prima dell'ora di fine
          if (minuteOfDay < allDayEnd) return 'ON_CALL';
        } else {
          return 'ON_CALL';
        }
      }
    }
  }

  // ── PRE / POST ────────────────────────────────────────────────────────────
  // PRE = prima della finestra lavorativa (stessa giornata UTC)
  if (isWorkDay && utcMoD < whStart) return 'PRE';
  return 'POST';
}
