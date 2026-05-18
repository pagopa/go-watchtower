'use client'

import { useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Bell, BellOff, Settings } from 'lucide-react'
import type { AlertPriorityLevel, NotificationCategory, NotificationPreferences } from '@go-watchtower/shared'
import { AlertPriorityCodes, NOTIFICATION_CATEGORY_LABELS, normalizeAlertPriorityCode } from '@go-watchtower/shared'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useNotificationPermission } from '@/hooks/use-notification-permission'

interface NotificationCategoryToggleProps {
  category: NotificationCategory
  priorityLevels: AlertPriorityLevel[]
  notificationPrefs: NotificationPreferences | undefined
  onUpdate: (prefs: NotificationPreferences) => void
}

function getEnabledCodes(
  notificationPrefs: NotificationPreferences | undefined,
  priorityLevels: AlertPriorityLevel[],
): Set<string> {
  if (notificationPrefs?.priority?.enabledCodes) {
    return new Set(notificationPrefs.priority.enabledCodes.map(normalizeAlertPriorityCode))
  }

  const legacy = new Set<string>()
  if (notificationPrefs?.types) {
    if (notificationPrefs.types.ON_CALL_ALARM !== false) legacy.add(AlertPriorityCodes.ON_CALL)
    if (notificationPrefs.types.HIGH_PRIORITY_ALARM !== false) legacy.add(AlertPriorityCodes.HIGH)
    if (legacy.size > 0) return legacy
  }

  return new Set(priorityLevels.filter((level) => level.defaultNotify).map((level) => level.code))
}

export function NotificationCategoryToggle({
  category,
  priorityLevels,
  notificationPrefs,
  onUpdate,
}: NotificationCategoryToggleProps) {
  const { permission, request, isSupported } = useNotificationPermission()
  const categoryLabel = NOTIFICATION_CATEGORY_LABELS[category] ?? category
  const masterEnabled = notificationPrefs?.enabled ?? false

  const sortedLevels = useMemo(
    () => [...priorityLevels].filter((level) => level.isActive).sort((a, b) => b.rank - a.rank),
    [priorityLevels],
  )

  const enabledCodes = useMemo(
    () => getEnabledCodes(notificationPrefs, sortedLevels),
    [notificationPrefs, sortedLevels],
  )

  const enabledCount = masterEnabled
    ? sortedLevels.filter((level) => enabledCodes.has(level.code)).length
    : 0
  const allOn = sortedLevels.length > 0 && enabledCount === sortedLevels.length

  const tryRequestPermission = useCallback(async () => {
    if (isSupported && permission === 'default') {
      await request()
    }
  }, [isSupported, permission, request])

  const handleToggleCode = useCallback(async (code: string) => {
    const next = new Set(enabledCodes)
    if (next.has(code)) {
      next.delete(code)
    } else {
      await tryRequestPermission()
      next.add(code)
    }

    onUpdate({
      enabled: next.size > 0,
      priority: { enabledCodes: [...next] },
      types: notificationPrefs?.types,
    })
  }, [enabledCodes, notificationPrefs?.types, onUpdate, tryRequestPermission])

  const handleToggleAll = useCallback(async () => {
    if (allOn) {
      onUpdate({
        enabled: false,
        priority: { enabledCodes: [] },
        types: notificationPrefs?.types,
      })
      return
    }

    await tryRequestPermission()
    onUpdate({
      enabled: true,
      priority: { enabledCodes: sortedLevels.map((level) => level.code) },
      types: notificationPrefs?.types,
    })
  }, [allOn, notificationPrefs?.types, onUpdate, sortedLevels, tryRequestPermission])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={
            'relative gap-1.5 ' +
            (masterEnabled && enabledCount > 0 ? 'border-primary/30 text-primary' : '')
          }
          title={`Notifiche — ${categoryLabel}`}
        >
          {masterEnabled && enabledCount > 0
            ? <Bell className="h-4 w-4" />
            : <BellOff className="h-4 w-4 opacity-50" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          {categoryLabel}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {sortedLevels.map((level) => {
          const isOn = masterEnabled && enabledCodes.has(level.code)
          return (
            <DropdownMenuItem
              key={level.code}
              onClick={(e) => { e.preventDefault(); void handleToggleCode(level.code) }}
            >
              <span className="flex items-center gap-2 w-full">
                <span
                  className={
                    'h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ' +
                    (isOn
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/30')
                  }
                >
                  {isOn && (
                    <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="flex-1 text-sm">{level.label}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{level.code}</span>
              </span>
            </DropdownMenuItem>
          )
        })}

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={(e) => { e.preventDefault(); void handleToggleAll() }}>
          <span className="text-sm">{allOn ? 'Disattiva tutte' : 'Attiva tutte'}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <div className="px-2 py-1.5 flex items-center gap-2">
          <span
            className={
              'h-2 w-2 rounded-full shrink-0 ' +
              (permission === 'granted'
                ? 'bg-emerald-500'
                : permission === 'denied'
                  ? 'bg-amber-500'
                  : 'bg-muted-foreground/40')
            }
          />
          <span className="text-[11px] text-muted-foreground">
            {permission === 'granted'
              ? 'Browser: autorizzate'
              : permission === 'denied'
                ? 'Browser: bloccate'
                : 'Browser: non richieste'}
          </span>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/profile#notifiche" className="flex items-center gap-2 text-sm">
            <Settings className="h-3.5 w-3.5" />
            Gestisci nel profilo
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
