import type { AlarmEvent } from '@/lib/api-client'

/** Thin wrapper so existing call-sites keep working with an AlarmEvent object. */
export function isHighEvent(event: AlarmEvent): boolean {
  return event.priority.rank > 0 && !event.priority.countsAsOnCall
}
