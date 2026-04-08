'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { Bell, BellOff, Settings } from 'lucide-react'
import {
  NOTIFICATION_DEFINITIONS,
  NOTIFICATION_CATEGORY_LABELS,
  getTypesForCategory,
} from '@go-watchtower/shared'
import type { NotificationCategory, NotificationType, NotificationPreferences } from '@go-watchtower/shared'
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
  notificationPrefs: NotificationPreferences | undefined
  onUpdate: (prefs: NotificationPreferences) => void
}

export function NotificationCategoryToggle({
  category,
  notificationPrefs,
  onUpdate,
}: NotificationCategoryToggleProps) {
  const types = getTypesForCategory(category)
  const { permission, request, isSupported } = useNotificationPermission()

  const masterEnabled = notificationPrefs?.enabled ?? false

  const isTypeOn = useCallback(
    (type: NotificationType) => {
      if (!masterEnabled) return false
      return notificationPrefs?.types[type] !== false
    },
    [masterEnabled, notificationPrefs],
  )

  const enabledCount = masterEnabled ? types.filter((t) => isTypeOn(t)).length : 0
  const allOn = enabledCount === types.length

  const tryRequestPermission = useCallback(async () => {
    if (isSupported && permission === 'default') {
      await request()
    }
  }, [isSupported, permission, request])

  const handleToggleType = useCallback(
    async (type: NotificationType) => {
      const currentlyOn = isTypeOn(type)

      if (!currentlyOn) {
        await tryRequestPermission()
        onUpdate({
          enabled: true,
          types: { ...notificationPrefs?.types, [type]: true },
        })
      } else {
        const newTypes = { ...notificationPrefs?.types, [type]: false }
        const anyStillOn = types.some((t) => t === type ? false : (newTypes[t] !== false))
        onUpdate({
          enabled: anyStillOn,
          types: newTypes,
        })
      }
    },
    [isTypeOn, tryRequestPermission, onUpdate, notificationPrefs, types],
  )

  const handleToggleAll = useCallback(
    async () => {
      if (allOn) {
        const offTypes: Partial<Record<NotificationType, boolean>> = {}
        for (const t of types) offTypes[t] = false
        onUpdate({ enabled: false, types: { ...notificationPrefs?.types, ...offTypes } })
      } else {
        await tryRequestPermission()
        const onTypes: Partial<Record<NotificationType, boolean>> = {}
        for (const t of types) onTypes[t] = true
        onUpdate({ enabled: true, types: { ...notificationPrefs?.types, ...onTypes } })
      }
    },
    [allOn, types, tryRequestPermission, onUpdate, notificationPrefs],
  )

  const categoryLabel = NOTIFICATION_CATEGORY_LABELS[category] ?? category

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={
            'relative gap-1.5 ' +
            (masterEnabled && enabledCount > 0
              ? 'border-primary/30 text-primary'
              : '')
          }
          title={`Notifiche — ${categoryLabel}`}
        >
          {masterEnabled && enabledCount > 0
            ? <Bell className="h-4 w-4" />
            : <BellOff className="h-4 w-4 opacity-50" />}
          {masterEnabled && enabledCount > 0 && (
            <span
              className={
                'absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-background ' +
                (permission === 'granted'
                  ? 'bg-emerald-500'
                  : permission === 'denied'
                    ? 'bg-amber-500'
                    : 'bg-muted-foreground/40')
              }
              title={
                permission === 'granted'
                  ? 'Browser: autorizzate'
                  : permission === 'denied'
                    ? 'Browser: bloccate'
                    : 'Browser: non ancora richieste'
              }
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          {categoryLabel}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {types.map((type) => (
          <DropdownMenuItem
            key={type}
            onClick={(e) => { e.preventDefault(); handleToggleType(type) }}
          >
            <span className="flex items-center gap-2 w-full">
              <span
                className={
                  'h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ' +
                  (isTypeOn(type)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/30')
                }
              >
                {isTypeOn(type) && (
                  <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="text-sm">{NOTIFICATION_DEFINITIONS[type].label}</span>
            </span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={(e) => { e.preventDefault(); handleToggleAll() }}
        >
          <span className="text-sm">
            {allOn ? 'Disattiva tutte' : 'Attiva tutte'}
          </span>
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
