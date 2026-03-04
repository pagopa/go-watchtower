import type { TimeConstraint } from '../types/time-constraint.js';

/**
 * Minimal subset of an IgnoredAlarm record needed for matching.
 * Compatible with both frontend (api-client) and backend (Prisma) representations.
 */
export interface IgnoredAlarmEntry {
  id: string;
  alarmId: string;
  environmentId: string;
  isActive: boolean;
  validity: TimeConstraint[];
  exclusions: TimeConstraint[];
  reason: string | null;
}

/**
 * Returns true if the UTC datetime satisfies the given TimeConstraint.
 *
 * All specified sub-conditions are ANDed (periods AND weekdays AND hours).
 * A constraint with no sub-conditions always matches.
 */
function isWithinTimeConstraint(dt: Date, c: TimeConstraint): boolean {
  const checks: boolean[] = [];

  if (c.periods && c.periods.length > 0) {
    checks.push(c.periods.some((p) => dt >= new Date(p.start) && dt <= new Date(p.end)));
  }

  if (c.weekdays && c.weekdays.length > 0) {
    // Date.getUTCDay(): 0=Sun, 1=Mon, …, 6=Sat — matches WEEKDAY_MIN/WEEKDAY_MAX convention.
    checks.push(c.weekdays.includes(dt.getUTCDay()));
  }

  if (c.hours && c.hours.length > 0) {
    const hh = String(dt.getUTCHours()).padStart(2, '0');
    const mm = String(dt.getUTCMinutes()).padStart(2, '0');
    const t = `${hh}:${mm}`;
    checks.push(c.hours.some((h) => t >= h.start && t <= h.end));
  }

  // A constraint with no conditions is an unconditional match.
  if (checks.length === 0) return true;

  // All specified conditions must hold (AND semantics within a constraint).
  return checks.every((v) => v);
}

/**
 * Returns true if the UTC datetime matches at least one TimeConstraint in the array.
 * An empty array is treated as "no restriction" (always matches).
 */
function matchesConstraints(dt: Date, constraints: TimeConstraint[]): boolean {
  if (constraints.length === 0) return true;
  return constraints.some((c) => isWithinTimeConstraint(dt, c));
}

/**
 * Determines whether an alarm should be considered "ignored" given a list of
 * IgnoredAlarmEntry records fetched for the current product.
 *
 * Returns the matching IgnoredAlarmEntry if the alarm is ignored, or null.
 *
 * Matching logic:
 * 1. Find the entry where alarmId + environmentId match and isActive is true.
 * 2. If validity is non-empty, firstAlarmAt must fall within at least one constraint.
 * 3. If exclusions is non-empty and firstAlarmAt falls within one, the alarm is NOT ignored.
 *
 * @param params.alarmId        - The alarm being analysed.
 * @param params.environmentId  - The environment being analysed.
 * @param params.firstAlarmAt   - UTC timestamp of the first alarm occurrence (Date or ISO string).
 * @param params.ignoredAlarms  - Pre-fetched list of ignored alarm configurations.
 */
export function matchIgnoredAlarm(params: {
  alarmId: string;
  environmentId: string;
  firstAlarmAt: Date | string;
  ignoredAlarms: IgnoredAlarmEntry[];
}): IgnoredAlarmEntry | null {
  const dt = params.firstAlarmAt instanceof Date
    ? params.firstAlarmAt
    : new Date(params.firstAlarmAt);

  if (isNaN(dt.getTime())) return null;

  const entry = params.ignoredAlarms.find(
    (ia) =>
      ia.alarmId === params.alarmId &&
      ia.environmentId === params.environmentId &&
      ia.isActive,
  );

  if (!entry) return null;

  // Validity: must fall within at least one constraint (empty = always valid).
  if (!matchesConstraints(dt, entry.validity)) return null;

  // Exclusions: if the timestamp falls in an exclusion window, it is NOT ignored.
  if (entry.exclusions.length > 0 && matchesConstraints(dt, entry.exclusions)) return null;

  return entry;
}
