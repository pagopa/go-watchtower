'use client'

import { useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import type { NotificationPreferences, AlertPriorityLevel } from '@go-watchtower/shared'
import { AlertPriorityCodes, normalizeAlertPriorityCode } from '@go-watchtower/shared'
import { api } from '@/lib/api-client'
import type { AlarmEvent } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { usePreferences } from '@/hooks/use-preferences'
import {
  readCursors,
  writeCursors,
  isEventPastCursor,
  advanceCursor,
} from '@/lib/notification-cursors'
import type { CursorMap } from '@/lib/notification-cursors'

const POLL_INTERVAL = 30_000
const MONITOR_PAGE_SIZE = 50
const LOCK_NAME = 'watchtower-notif'

export interface NewAlarmSignal {
  count: number
  detectedAt: number
}

function supportsLocks(): boolean {
  return typeof navigator !== 'undefined' && 'locks' in navigator
}

function getEnabledPriorityCodes(
  prefs: NotificationPreferences,
  levels: AlertPriorityLevel[],
): Set<string> {
  const explicitCodes = prefs.priority?.enabledCodes
  if (explicitCodes) {
    return new Set(explicitCodes.map(normalizeAlertPriorityCode))
  }

  const migratedLegacy = new Set<string>()
  if (prefs.types) {
    if (prefs.types.ON_CALL_ALARM !== false) migratedLegacy.add(AlertPriorityCodes.ON_CALL)
    if (prefs.types.HIGH_PRIORITY_ALARM !== false) migratedLegacy.add(AlertPriorityCodes.HIGH)
    if (migratedLegacy.size > 0) return migratedLegacy
  }

  return new Set(levels.filter((level) => level.defaultNotify).map((level) => level.code))
}

function initCursors(events: AlarmEvent[]): void {
  let newCursors: CursorMap = {}

  for (const event of events) {
    const code = event.priority.code
    const advanced = advanceCursor(newCursors[code], event.createdAt, event.id)
    if (advanced !== newCursors[code]) {
      newCursors = { ...newCursors, [code]: advanced }
    }
  }

  if (Object.keys(newCursors).length > 0) {
    writeCursors(newCursors)
  }
}

export function NotificationSupervisor() {
  const { status } = useSession()
  const queryClient = useQueryClient()
  const { preferences } = usePreferences()
  const notifPrefs = preferences.notifications
  const masterEnabled = notifPrefs?.enabled ?? false
  const lastProcessedAtRef = useRef(0)

  const { data: priorityLevels } = useQuery({
    queryKey: qk.priorityLevels.list,
    queryFn: api.getPriorityLevels,
    enabled: status === 'authenticated' && masterEnabled,
    staleTime: 5 * 60_000,
  })

  const levelMap = useMemo(() => {
    const map = new Map<string, AlertPriorityLevel>()
    for (const level of priorityLevels ?? []) {
      map.set(level.code, level)
    }
    return map
  }, [priorityLevels])

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

  const processEvents = useCallback((
    events: AlarmEvent[],
    prefs: NotificationPreferences,
    levels: AlertPriorityLevel[],
  ) => {
    const enabledCodes = getEnabledPriorityCodes(prefs, levels)
    const cursors = readCursors()
    let newCursors: CursorMap = { ...cursors }
    const counts: Record<string, number> = {}
    let hasNewCursors = false

    for (const event of events) {
      const code = event.priority.code
      const cursor = cursors[code]
      const advanced = advanceCursor(newCursors[code], event.createdAt, event.id)
      if (advanced !== newCursors[code]) {
        newCursors = { ...newCursors, [code]: advanced }
        hasNewCursors = true
      }

      if (enabledCodes.has(code) && isEventPastCursor(event.createdAt, event.id, cursor)) {
        counts[code] = (counts[code] ?? 0) + 1
      }
    }

    const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
    if (total > 0) {
      const parts = Object.entries(counts)
        .sort((a, b) => (levelMap.get(b[0])?.rank ?? 0) - (levelMap.get(a[0])?.rank ?? 0))
        .map(([code, count]) => {
          const label = levelMap.get(code)?.label ?? code
          return `${count} ${label}`
        })

      const body = total === 1
        ? `Nuovo allarme ${parts[0]} rilevato`
        : `Nuovi allarmi: ${parts.join(', ')}`

      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('Watchtower — Allarmi prioritari', {
          body,
          tag: 'watchtower-alarm-events',
          icon: '/logo1.png',
        })
      }

      queryClient.setQueryData<NewAlarmSignal>(
        qk.alarmEvents.newAlarmSignal,
        (prev) => ({
          count: (prev?.count ?? 0) + total,
          detectedAt: Date.now(),
        }),
      )
    }

    if (hasNewCursors) {
      writeCursors(newCursors)
    }
  }, [levelMap, queryClient])

  useEffect(() => {
    if (!masterEnabled || !notifPrefs || !monitorResponse?.data || !priorityLevels) return
    if (dataUpdatedAt <= lastProcessedAtRef.current) return
    lastProcessedAtRef.current = dataUpdatedAt

    const events = monitorResponse.data
    const existingCursors = readCursors()
    if (Object.keys(existingCursors).length === 0) {
      initCursors(events)
      return
    }

    const process = () => processEvents(events, notifPrefs, priorityLevels)

    if (supportsLocks()) {
      navigator.locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
        if (!lock) return
        process()
      })
    } else {
      process()
    }
  }, [masterEnabled, notifPrefs, monitorResponse, dataUpdatedAt, priorityLevels, processEvents])

  useEffect(() => {
    if (!masterEnabled) {
      lastProcessedAtRef.current = 0
    }
  }, [masterEnabled])

  return null
}
