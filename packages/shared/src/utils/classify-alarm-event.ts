// ── Alarm event classification (domain logic) ───────────────────────────────
//
// These functions determine whether an alarm event is "High" based on
// business rules. They are used by both rendering components and the
// notification supervisor.

/** Hardcoded prefix for High alarms (will be configurable in the future). */
const HIGH_PREFIX = 'workday-';

/** Returns true if the alarm event name matches the High pattern. */
export function isHighAlarm(name: string): boolean {
  return name.startsWith(HIGH_PREFIX);
}
