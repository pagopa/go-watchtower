import type { TimeConstraint } from '../types/time-constraint.js';

export function isWithinTimeConstraint(dt: Date, constraint: TimeConstraint): boolean {
  const checks: boolean[] = [];

  if (constraint.periods && constraint.periods.length > 0) {
    checks.push(constraint.periods.some((period) => dt >= new Date(period.start) && dt <= new Date(period.end)));
  }

  if (constraint.weekdays && constraint.weekdays.length > 0) {
    checks.push(constraint.weekdays.includes(dt.getUTCDay()));
  }

  if (constraint.hours && constraint.hours.length > 0) {
    const hh = String(dt.getUTCHours()).padStart(2, '0');
    const mm = String(dt.getUTCMinutes()).padStart(2, '0');
    const time = `${hh}:${mm}`;
    checks.push(constraint.hours.some((hours) => time >= hours.start && time <= hours.end));
  }

  if (checks.length === 0) return true;
  return checks.every(Boolean);
}

export function matchesTimeConstraints(dt: Date, constraints: TimeConstraint[]): boolean {
  if (constraints.length === 0) return true;
  return constraints.some((constraint) => isWithinTimeConstraint(dt, constraint));
}
