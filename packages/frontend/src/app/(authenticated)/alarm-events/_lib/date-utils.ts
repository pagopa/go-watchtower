// ─── Date utilities ───────────────────────────────────────────────────────────

export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

export function shiftDay(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!, 12))
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

export function formatDateLong(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!, 12))
  const s = date.toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Minuto del giorno (0–1439) dell'istante ISO nella timezone indicata. */
export function minuteOfDayInTz(isoString: string, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(new Date(isoString))
  const h = Number(parts.find((p) => p.type === 'hour')?.value   ?? 0)
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

/** ISO weekday (1=Lun…7=Dom) del giorno locale dell'istante nella timezone indicata. */
export function isoWeekdayInTz(isoString: string, tz: string): number {
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(isoString)) // "YYYY-MM-DD"
  const [y, mo, d] = localDate.split('-').map(Number)
  const dow = new Date(Date.UTC(y!, mo! - 1, d!, 12)).getUTCDay()
  return dow === 0 ? 7 : dow
}

/**
 * Restituisce i bound UTC per l'intera giornata locale `dateStr` nella timezone `tz`.
 * Usa come riferimento il noon UTC per stimare l'offset (accurato per offset fissi
 * e per la maggior parte dei casi DST).
 */
export function localDayBoundsUTC(dateStr: string, tz: string): { dateFrom: string; dateTo: string } {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const noonUTC = new Date(Date.UTC(y!, mo! - 1, d!, 12))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(noonUTC)
  const lh = Number(parts.find((p) => p.type === 'hour')?.value   ?? 12)
  const lm = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  const offsetMs = ((lh * 60 + lm) - 12 * 60) * 60_000
  const startMs  = Date.UTC(y!, mo! - 1, d!, 0)  - offsetMs
  const endMs    = Date.UTC(y!, mo! - 1, d!, 24) - offsetMs - 1
  return {
    dateFrom: new Date(startMs).toISOString(),
    dateTo:   new Date(endMs).toISOString(),
  }
}
