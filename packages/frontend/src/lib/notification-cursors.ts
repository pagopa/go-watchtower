// ── Notification cursor management (localStorage) ───────────────────────────
//
// Cursors track the "high-water mark" per notification type so the supervisor
// knows which events have already been notified. They live in localStorage for
// cross-tab synchronisation and survive page refreshes.
//
// Structure per type:
//   { createdAt: ISO string, idsAtCursor: string[] }
//
// An event is "new" if:
//   event.createdAt > cursor.createdAt
//   OR (event.createdAt === cursor.createdAt AND event.id NOT IN cursor.idsAtCursor)

import { AlertPriorityCodes, LegacyAlertPriorityCodes } from '@go-watchtower/shared'

const STORAGE_KEY = 'watchtower-notif-cursors'

export interface NotificationCursor {
  createdAt: string     // ISO datetime of the most advanced event
  idsAtCursor: string[] // IDs of events at that exact createdAt (handles collisions)
}

export type CursorMap = Partial<Record<string, NotificationCursor>>

function mergeCursors(
  current: NotificationCursor | undefined,
  legacy: NotificationCursor,
): NotificationCursor {
  if (!current) return legacy
  if (current.createdAt > legacy.createdAt) return current
  if (legacy.createdAt > current.createdAt) return legacy

  return {
    createdAt: current.createdAt,
    idsAtCursor: [...new Set([...current.idsAtCursor, ...legacy.idsAtCursor])],
  }
}

function normalizeLegacyCursorCodes(cursors: CursorMap): CursorMap {
  const legacyCursor = cursors[LegacyAlertPriorityCodes.HIGH_PRIORITY]
  if (!legacyCursor) return cursors

  const normalized = { ...cursors }
  delete normalized[LegacyAlertPriorityCodes.HIGH_PRIORITY]
  normalized[AlertPriorityCodes.HIGH] = mergeCursors(
    normalized[AlertPriorityCodes.HIGH],
    legacyCursor,
  )
  return normalized
}

/** Read cursors from localStorage. Returns empty map if unavailable. */
export function readCursors(): CursorMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as CursorMap
    const normalized = normalizeLegacyCursorCodes(parsed)
    if (normalized !== parsed) writeCursors(normalized)
    return normalized
  } catch {
    return {}
  }
}

/** Write cursors to localStorage. */
export function writeCursors(cursors: CursorMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeLegacyCursorCodes(cursors)))
  } catch {
    // localStorage full or unavailable — silently degrade
  }
}

/**
 * Check if an event is "new" relative to the given cursor.
 * If cursor is undefined, the event is considered new (first-time init will handle this).
 */
export function isEventPastCursor(
  eventCreatedAt: string,
  eventId: string,
  cursor: NotificationCursor | undefined,
): boolean {
  if (!cursor) return true
  if (eventCreatedAt > cursor.createdAt) return true
  if (eventCreatedAt === cursor.createdAt && !cursor.idsAtCursor.includes(eventId)) return true
  return false
}

/**
 * Advance a cursor to include the given event.
 * Returns a new cursor object (immutable).
 */
export function advanceCursor(
  current: NotificationCursor | undefined,
  eventCreatedAt: string,
  eventId: string,
): NotificationCursor {
  if (!current || eventCreatedAt > current.createdAt) {
    return { createdAt: eventCreatedAt, idsAtCursor: [eventId] }
  }
  if (eventCreatedAt === current.createdAt) {
    return {
      createdAt: current.createdAt,
      idsAtCursor: current.idsAtCursor.includes(eventId)
        ? current.idsAtCursor
        : [...current.idsAtCursor, eventId],
    }
  }
  // eventCreatedAt < current.createdAt — cursor already ahead
  return current
}
