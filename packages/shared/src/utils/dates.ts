/**
 * Utility centralizzate per la gestione delle date — Luxon-based.
 *
 * Tutte le conversioni timezone, formattazione e date math passano da qui.
 * Gestisce correttamente i passaggi ora solare ↔ legale.
 */

import { DateTime, Settings } from 'luxon';

Settings.defaultLocale = 'it';

const ROME_TZ = 'Europe/Rome';

// ═══════════════════════════════════════════════════════════════════════════
// Low-level timezone parts
// ═══════════════════════════════════════════════════════════════════════════

/** Parti di data/ora in un fuso orario IANA. */
export interface LocalParts {
  year:       number;  // es. 2026
  month:      number;  // 1–12
  day:        number;  // 1–31
  isoWeekday: number;  // 1=Lun … 7=Dom
  hour:       number;  // 0–23
  minute:     number;  // 0–59
}

/**
 * Estrae le parti di data/ora da un istante UTC nel fuso orario specificato.
 */
export function getLocalParts(date: Date, timezone: string): LocalParts {
  const dt = DateTime.fromJSDate(date, { zone: timezone });
  return {
    year:       dt.year,
    month:      dt.month,
    day:        dt.day,
    isoWeekday: dt.weekday,   // 1=Mon … 7=Sun (ISO)
    hour:       dt.hour,
    minute:     dt.minute,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Business-day assignment
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Assegna un allarme al suo "giorno lavorativo" secondo le regole:
 *
 * **Allarmi on-call**: contano sempre sul loro giorno di calendario.
 *
 * **Allarmi normali**:
 * - Lun–Ven prima delle 18:00 → stesso giorno
 * - Lun–Gio ≥ 18:00          → giorno successivo
 * - Ven ≥ 18:00               → lunedì successivo (+3)
 * - Sabato                     → lunedì successivo (+2)
 * - Domenica                   → lunedì successivo (+1)
 */
export function assignAlarmBusinessDay(
  firedAt:  Date,
  isOnCall: boolean,
  timezone = ROME_TZ,
): { year: number; month: number; day: number } {
  const dt = DateTime.fromJSDate(firedAt, { zone: timezone });

  if (isOnCall) {
    return { year: dt.year, month: dt.month, day: dt.day };
  }

  const minuteOfDay = dt.hour * 60 + dt.minute;
  const dow = dt.weekday; // 1=Lun … 7=Dom

  let daysToAdd = 0;
  if (dow >= 1 && dow <= 5 && minuteOfDay < 18 * 60) {
    daysToAdd = 0;          // Lun–Ven prima delle 18:00
  } else if (dow >= 1 && dow <= 4 && minuteOfDay >= 18 * 60) {
    daysToAdd = 1;          // Lun–Gio ≥ 18:00
  } else if (dow === 5 && minuteOfDay >= 18 * 60) {
    daysToAdd = 3;          // Ven ≥ 18:00 → lunedì
  } else if (dow === 6) {
    daysToAdd = 2;          // Sabato → lunedì
  } else if (dow === 7) {
    daysToAdd = 1;          // Domenica → lunedì
  }

  if (daysToAdd === 0) {
    return { year: dt.year, month: dt.month, day: dt.day };
  }

  const shifted = dt.plus({ days: daysToAdd });
  return { year: shifted.year, month: shifted.month, day: shifted.day };
}

// ═══════════════════════════════════════════════════════════════════════════
// Formatting — display
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Formatta un ISO string come data+ora nel fuso Europe/Rome.
 * Es. "12/03/2026 14:30"
 */
export function formatDateTimeRome(isoStr: string): string {
  if (!isoStr) return '—';
  return DateTime.fromISO(isoStr, { zone: 'utc' }).setZone(ROME_TZ).toFormat('dd/MM/yyyy HH:mm');
}

/**
 * Formatta un ISO string come data+ora in UTC.
 * Es. "12/03/2026 13:30"
 */
export function formatDateTimeUTC(isoStr: string): string {
  if (!isoStr) return '—';
  return DateTime.fromISO(isoStr, { zone: 'utc' }).toFormat('dd/MM/yyyy HH:mm');
}

export interface DualDateTime {
  utc:  string;
  rome: string;
}

/**
 * Restituisce sia la rappresentazione UTC che Rome di un timestamp.
 */
export function formatDateTimeDual(isoStr: string): DualDateTime {
  if (!isoStr) return { utc: '—', rome: '—' };
  const dt = DateTime.fromISO(isoStr, { zone: 'utc' });
  return {
    utc:  dt.toFormat('dd/MM/yyyy HH:mm'),
    rome: dt.setZone(ROME_TZ).toFormat('dd/MM/yyyy HH:mm'),
  };
}

/**
 * Formatta come "dd/MM/yyyy" (solo data, locale italiano).
 */
export function formatDate(isoStr: string): string {
  if (!isoStr) return '—';
  return DateTime.fromISO(isoStr).toFormat('dd/MM/yyyy');
}

/**
 * Formatta come "dd/MM/yyyy, HH:mm" (locale italiano).
 */
export function formatDateTime(isoStr: string): string {
  if (!isoStr) return '—';
  return DateTime.fromISO(isoStr).toFormat('dd/MM/yyyy, HH:mm');
}

/**
 * Formatta come "dd MMMM yyyy" (es. "12 marzo 2026").
 */
export function formatDateLong(isoStr: string): string {
  if (!isoStr) return '—';
  return DateTime.fromISO(isoStr).setLocale('it').toFormat('dd MMMM yyyy');
}

/**
 * Formatta come "dd/MM/yyyy" (alias di formatDate).
 */
export const formatDateShort = formatDate;

/**
 * Formatta una Date JS con un pattern Luxon e locale opzionale.
 * Usato dai componenti UI (DateTimePicker, DateRangePicker).
 *
 * Formati comuni:
 * - `"yyyy-MM-dd'T'HH:mm"` → "2026-03-12T14:30"
 * - `"dd MMM yyyy"`         → "12 mar 2026"
 * - `"dd/MM/yyyy HH:mm"`   → "12/03/2026 14:30"
 */
export function formatJsDate(date: Date, fmt: string, locale = 'it'): string {
  return DateTime.fromJSDate(date).setLocale(locale).toFormat(fmt);
}

/**
 * Tempo relativo in italiano: "3 ore fa", "tra 2 giorni".
 */
export function formatRelativeTime(isoStr: string): string {
  if (!isoStr) return '—';
  return DateTime.fromISO(isoStr).setLocale('it').toRelative() ?? '—';
}

/**
 * Formatta una Date JS come tempo relativo in italiano.
 * Es. "3 ore fa", "2 minuti fa".
 */
export function formatRelativeTimeFromDate(date: Date): string {
  return DateTime.fromJSDate(date).setLocale('it').toRelative() ?? '—';
}

/**
 * Formatta una Date JS come data+ora assoluta in italiano.
 * Es. "12 mar 2026 · 14:30:55"
 */
export function formatAbsoluteDateTime(date: Date, fmt = "dd MMM yyyy '·' HH:mm:ss"): string {
  return DateTime.fromJSDate(date).setLocale('it').toFormat(fmt);
}

/**
 * Formatta una durata in millisecondi come "Xh Ym Zs".
 */
export function formatDuration(ms: number | null): string {
  if (ms == null) return '-';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 0) return '-';
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Calcola il MTTA (Mean Time To Acknowledge) come stringa leggibile.
 */
export function computeMTTA(analysisDate: string, firstAlarmAt: string): string {
  if (!analysisDate || !firstAlarmAt) return '—';
  const diffMs = new Date(analysisDate).getTime() - new Date(firstAlarmAt).getTime();
  if (diffMs < 0) return '—';
  const totalMins = Math.round(diffMs / 60_000);
  const hours = Math.floor(totalMins / 60);
  const mins  = totalMins % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Conversione timezone — input form
// ═══════════════════════════════════════════════════════════════════════════

/**
 * UTC ISO → "yyyy-MM-ddTHH:mm" in Europe/Rome.
 * Per pre-riempire il DateTimePicker con analysisDate.
 */
export function isoToRomeLocal(iso: string): string {
  if (!iso) return '';
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(ROME_TZ).toFormat("yyyy-MM-dd'T'HH:mm");
}

/**
 * UTC ISO → "yyyy-MM-ddTHH:mm" in UTC.
 * Per pre-riempire il DateTimePicker con firstAlarmAt/lastAlarmAt.
 */
export function isoToUTCLocal(iso: string): string {
  if (!iso) return '';
  return iso.slice(0, 16);
}

/**
 * "yyyy-MM-ddTHH:mm" interpretato come Europe/Rome → UTC ISO string.
 * Per submit di analysisDate.
 */
export function romeLocalToISO(val: string): string {
  if (!val) return '';
  return DateTime.fromISO(val, { zone: ROME_TZ }).toUTC().toISO()!;
}

/**
 * "yyyy-MM-ddTHH:mm" interpretato come UTC → UTC ISO string.
 * Per submit di firstAlarmAt/lastAlarmAt.
 */
export function utcLocalToISO(val: string): string {
  if (!val) return '';
  return new Date(val + ':00.000Z').toISOString();
}

/**
 * "yyyy-MM-dd" interpretato come Europe/Rome → UTC ISO string (inizio giornata).
 */
export function romeDateToISO(val: string, time = '00:00:00'): string {
  if (!val) return '';
  return DateTime.fromISO(`${val}T${time}`, { zone: ROME_TZ }).toUTC().toISO()!;
}

// ═══════════════════════════════════════════════════════════════════════════
// Date math
// ═══════════════════════════════════════════════════════════════════════════

/** Inizio del mese della data specificata (o oggi). */
export function startOfMonth(date?: Date): Date {
  const dt = date ? DateTime.fromJSDate(date) : DateTime.now();
  return dt.startOf('month').toJSDate();
}

/** Sottrae N mesi dalla data. */
export function subMonths(date: Date, n: number): Date {
  return DateTime.fromJSDate(date).minus({ months: n }).toJSDate();
}

/** Sottrae N giorni dalla data. */
export function subDays(date: Date, n: number): Date {
  return DateTime.fromJSDate(date).minus({ days: n }).toJSDate();
}

/** Verifica se due Date cadono nello stesso giorno. */
export function isSameDay(a: Date, b: Date): boolean {
  return DateTime.fromJSDate(a).hasSame(DateTime.fromJSDate(b), 'day');
}

/**
 * Parsa una stringa con un formato Luxon e restituisce una Date JS.
 * Restituisce null se il parsing fallisce.
 *
 * Formati comuni: `"dd/MM/yyyy HH:mm:ss"`, `"dd/MM/yyyy HH:mm"`, `"dd/MM/yyyy"`,
 * `"yyyy-MM-dd'T'HH:mm"`, `"yyyy-MM-dd"`.
 */
export function parseDate(text: string, fmt: string): Date | null {
  const dt = DateTime.fromFormat(text, fmt);
  return dt.isValid ? dt.toJSDate() : null;
}

/**
 * Formatta la data corrente (o una data) nel fuso Europe/Rome con un dato pattern.
 * Es. `formatInRome(new Date(), "yyyy-MM-dd'T'HH:mm")` → "2026-03-12T14:30"
 */
export function formatInRome(date: Date, fmt: string): string {
  return DateTime.fromJSDate(date).setZone(ROME_TZ).toFormat(fmt);
}
