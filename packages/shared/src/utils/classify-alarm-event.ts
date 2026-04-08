// ── Alarm event classification (domain logic) ───────────────────────────────
//
// These functions determine whether an alarm event is "high priority" based on
// business rules. They are used by both rendering components and the
// notification supervisor.

/** Hardcoded prefix for high-priority alarms (will be configurable in the future). */
const HIGH_PRIORITY_PREFIX = 'workday-';

/** Returns true if the alarm event name matches the high-priority pattern. */
export function isHighPriorityAlarm(name: string): boolean {
  return name.startsWith(HIGH_PRIORITY_PREFIX);
}
