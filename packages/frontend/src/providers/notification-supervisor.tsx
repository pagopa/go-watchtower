'use client'

// ── NotificationSupervisor ──────────────────────────────────────────────────
//
// App-level provider (mounted in the authenticated layout) that monitors
// alarm events and sends browser notifications for on-call and high-priority
// alarms, independently of which page the user is viewing.
//
// Key design choices:
//   - Dedicated monitoring query sorted by createdAt DESC
//   - Per-type cursors with idsAtCursor for collision handling
//   - localStorage for cross-tab cursor persistence
//   - Web Locks API for cross-tab mutex (prevents duplicate notifications)
//   - Config (enabled/types) read from UserPreferences via usePreferences()
//   - dataUpdatedAt tracking to detect every refetch (bypasses structural sharing)
//   - Silent init only on truly first load (no cursors in localStorage)

import { useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { isHighPriorityAlarm } from '@go-watchtower/shared'
import type { NotificationType, NotificationPreferences } from '@go-watchtower/shared'
import { api } from '@/lib/api-client'
import type { AlarmEvent, Environment } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { usePreferences } from '@/hooks/use-preferences'
import {
  readCursors,
  writeCursors,
  isEventPastCursor,
  advanceCursor,
} from '@/lib/notification-cursors'
import type { CursorMap } from '@/lib/notification-cursors'

// ── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL = 30_000           // 30 seconds
const MONITOR_PAGE_SIZE = 50           // enough to catch bursts; createdFrom limits scope after init
const LOCK_NAME = 'watchtower-notif'

/** Shape of the signal written to the query cache when new important alarms are detected. */
export interface NewAlarmSignal {
  count: number
  detectedAt: number // Date.now() timestamp
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildOnCallRegexMap(environments: Environment[]): Map<string, RegExp> {
  const map = new Map<string, RegExp>()
  for (const e of environments) {
    if (e.onCallAlarmPattern) {
      try { map.set(e.id, new RegExp(e.onCallAlarmPattern)) } catch { /* invalid regex */ }
    }
  }
  return map
}

function classifyAlarmEvent(
  event: AlarmEvent,
  onCallRegexMap: Map<string, RegExp>,
): NotificationType | null {
  const regex = onCallRegexMap.get(event.environment.id)
  if (regex?.test(event.name)) return 'ON_CALL_ALARM'
  if (isHighPriorityAlarm(event.name)) return 'HIGH_PRIORITY_ALARM'
  return null
}

function isTypeEnabled(prefs: NotificationPreferences, type: NotificationType): boolean {
  return prefs.types[type] !== false
}

function supportsLocks(): boolean {
  return typeof navigator !== 'undefined' && 'locks' in navigator
}

/** Initialize cursors for all classified events without sending notifications. */
function initCursors(events: AlarmEvent[], environments: Environment[]): void {
  const onCallRegexMap = buildOnCallRegexMap(environments)
  let newCursors: CursorMap = {}

  for (const event of events) {
    const type = classifyAlarmEvent(event, onCallRegexMap)
    if (!type) continue
    const advanced = advanceCursor(newCursors[type], event.createdAt, event.id)
    if (advanced !== newCursors[type]) {
      newCursors = { ...newCursors, [type]: advanced }
    }
  }

  if (Object.keys(newCursors).length > 0) {
    writeCursors(newCursors)
  }
}

// ── Supervisor Component ─────────────────────────────────────────────────────

export function NotificationSupervisor() {
  const { status } = useSession()
  const queryClient = useQueryClient()
  const { preferences } = usePreferences()
  const notifPrefs = preferences.notifications
  const masterEnabled = notifPrefs?.enabled ?? false

  // Track which fetch we last processed — prevents skipping refetches
  // that return structurally identical data (TanStack structural sharing).
  const lastProcessedAtRef = useRef(0)

  // --- Monitoring query: products → environments → on-call patterns ---

  const { data: products } = useQuery({
    queryKey: qk.products.list,
    queryFn: api.getProducts,
    enabled: status === 'authenticated' && masterEnabled,
    staleTime: 5 * 60_000,
  })

  const activeProductIds = products?.filter((p) => p.isActive).map((p) => p.id) ?? []

  const { data: allEnvironments } = useQuery<Environment[]>({
    queryKey: qk.products.allEnvironments(activeProductIds),
    queryFn: async () => {
      if (!activeProductIds.length) return []
      const arrays = await Promise.all(activeProductIds.map((id) => api.getEnvironments(id)))
      return arrays.flat()
    },
    enabled: activeProductIds.length > 0 && masterEnabled,
    staleTime: 5 * 60_000,
  })

  // --- Dedicated monitoring query (independent of UI filters) ---
  // Cursors are read fresh inside queryFn on each poll. After init (cursors
  // exist in localStorage), createdFrom limits results to truly new events,
  // keeping the payload small on steady-state polls.

  const { data: monitorResponse, dataUpdatedAt } = useQuery({
    queryKey: ['alarm-events', 'monitor'],
    queryFn: () => {
      const cursors = readCursors()
      const cursorDates = Object.values(cursors)
        .map((c) => c?.createdAt)
        .filter(Boolean) as string[]
      const createdFrom = cursorDates.length > 0
        ? cursorDates.reduce((a, b) => (a < b ? a : b))
        : undefined

      return api.getAlarmEvents({
        pageSize: MONITOR_PAGE_SIZE,
        sortBy: 'createdAt',
        ...(createdFrom && { createdFrom }),
      })
    },
    staleTime: 0,
    enabled: status === 'authenticated' && masterEnabled,
    refetchInterval: POLL_INTERVAL,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })

  // --- Process new events ---

  const processEvents = useCallback((
    events: AlarmEvent[],
    environments: Environment[],
    prefs: NotificationPreferences,
  ) => {
    const onCallRegexMap = buildOnCallRegexMap(environments)
    const cursors = readCursors()
    let newCursors: CursorMap = { ...cursors }
    const counts: Partial<Record<NotificationType, number>> = {}
    let hasNewCursors = false

    for (const event of events) {
      const type = classifyAlarmEvent(event, onCallRegexMap)
      if (!type) continue

      const cursor = cursors[type]

      // Always advance cursor (even for disabled types)
      const advanced = advanceCursor(newCursors[type], event.createdAt, event.id)
      if (advanced !== newCursors[type]) {
        newCursors = { ...newCursors, [type]: advanced }
        hasNewCursors = true
      }

      // Only count for notification if the type is enabled and event is new
      if (isTypeEnabled(prefs, type) && isEventPastCursor(event.createdAt, event.id, cursor)) {
        counts[type] = (counts[type] ?? 0) + 1
      }
    }

    // Send aggregated notification + write banner signal
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    if (total > 0) {
      const parts: string[] = []
      const onCallCount = counts.ON_CALL_ALARM ?? 0
      const highPriorityCount = counts.HIGH_PRIORITY_ALARM ?? 0
      if (onCallCount > 0) parts.push(`${onCallCount} on-call`)
      if (highPriorityCount > 0) parts.push(`${highPriorityCount} high`)

      const body = total === 1
        ? `Nuovo allarme ${parts[0]} rilevato`
        : `Nuovi allarmi: ${parts.join(', ')}`

      // Browser notification
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('Watchtower — Allarmi importanti', {
          body,
          tag: 'watchtower-alarm-events',
          icon: '/logo1.png',
        })
      }

      // In-app banner signal: accumulate count with any existing signal
      queryClient.setQueryData<NewAlarmSignal>(
        qk.alarmEvents.newAlarmSignal,
        (prev) => ({
          count: (prev?.count ?? 0) + total,
          detectedAt: Date.now(),
        }),
      )
    }

    // Persist cursors
    if (hasNewCursors) {
      writeCursors(newCursors)
    }
  }, [queryClient])

  // --- Main effect: runs on each poll cycle ---

  useEffect(() => {
    if (!masterEnabled || !notifPrefs || !monitorResponse?.data || !allEnvironments) return

    // dataUpdatedAt changes on EVERY refetch, even if data is structurally identical.
    // This ensures we process every poll cycle, not just when data changes shape.
    if (dataUpdatedAt <= lastProcessedAtRef.current) return
    lastProcessedAtRef.current = dataUpdatedAt

    const events = monitorResponse.data

    // Silent init: only when localStorage has NO cursors (truly first time).
    // After first init, cursors persist in localStorage across page refreshes,
    // so subsequent mounts go straight to processing.
    const existingCursors = readCursors()
    if (Object.keys(existingCursors).length === 0) {
      initCursors(events, allEnvironments)
      return
    }

    // Normal processing: detect new events and notify
    const process = () => processEvents(events, allEnvironments, notifPrefs)

    if (supportsLocks()) {
      navigator.locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
        if (!lock) return // Another tab is processing
        process()
      })
    } else {
      process()
    }
  }, [masterEnabled, notifPrefs, monitorResponse, dataUpdatedAt, allEnvironments, processEvents])

  // Reset processing tracking when master is toggled off
  useEffect(() => {
    if (!masterEnabled) {
      lastProcessedAtRef.current = 0
    }
  }, [masterEnabled])

  return null // Pure logic provider, no UI
}
