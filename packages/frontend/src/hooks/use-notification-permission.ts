'use client'

import { useCallback, useSyncExternalStore } from 'react'

type Permission = NotificationPermission // 'default' | 'granted' | 'denied'

/**
 * Il permesso non è stato di React: vive nel browser e cambia anche da fuori
 * (impostazioni del sito). Copiarlo in `useState` dentro un effetto costava un
 * render in più a ogni mount e teneva due copie della stessa verità, quindi si
 * legge dove sta. Lo snapshot server vale 'default' e mantiene l'idratazione
 * allineata al primo render client.
 */

function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

/** Registrati notificano `request()`, che deve poter forzare la rilettura. */
const listeners = new Set<() => void>()

function notifyListeners(): void {
  for (const listener of listeners) listener()
}

function subscribePermission(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)

  let detach: (() => void) | undefined
  let cancelled = false

  if (isNotificationSupported() && 'permissions' in navigator) {
    navigator.permissions
      .query({ name: 'notifications' })
      .then((status) => {
        if (cancelled) return
        status.addEventListener('change', onStoreChange)
        detach = () => status.removeEventListener('change', onStoreChange)
      })
      .catch(() => {
        /* la Permissions API non copre le notifiche su questo browser */
      })
  }

  return () => {
    cancelled = true
    listeners.delete(onStoreChange)
    detach?.()
  }
}

function getPermission(): Permission {
  return isNotificationSupported() ? Notification.permission : 'default'
}

function getServerPermission(): Permission {
  return 'default'
}

/** Il supporto non cambia durante la sessione: niente a cui sottoscriversi. */
const subscribeNothing = () => () => {}

function getServerSupported(): boolean {
  return false
}

export function useNotificationPermission() {
  const permission = useSyncExternalStore(subscribePermission, getPermission, getServerPermission)
  const isSupported = useSyncExternalStore(
    subscribeNothing,
    isNotificationSupported,
    getServerSupported,
  )

  const request = useCallback(async (): Promise<Permission> => {
    if (!isNotificationSupported()) return 'denied'
    const result = await Notification.requestPermission()
    // Non tutti i browser emettono `change` sul PermissionStatus dopo la
    // richiesta: la notifica esplicita garantisce il re-render.
    notifyListeners()
    return result
  }, [])

  return { permission, request, isSupported }
}
