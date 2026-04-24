import type { TimeConstraint } from '../types/time-constraint.js';
import { matchesTimeConstraints } from './time-constraints.js';

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
  if (!matchesTimeConstraints(dt, entry.validity)) return null;

  // Exclusions: if the timestamp falls in an exclusion window, it is NOT ignored.
  if (entry.exclusions.length > 0 && matchesTimeConstraints(dt, entry.exclusions)) return null;

  return entry;
}
