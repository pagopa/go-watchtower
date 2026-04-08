'use client'

import { useState, useCallback, useEffect } from 'react'

type Permission = NotificationPermission // 'default' | 'granted' | 'denied'

export function useNotificationPermission() {
  // Start with 'default' on both server and client to avoid hydration mismatch.
  // The real value is picked up in the useEffect below.
  const [permission, setPermission] = useState<Permission>('default')
  const [isSupported, setIsSupported] = useState(false)

  useEffect(() => {
    const supported = 'Notification' in window
    setIsSupported(supported)
    if (!supported) return

    setPermission(Notification.permission)

    // Listen for permission changes (e.g. user toggles in browser site settings)
    if ('permissions' in navigator) {
      let cleanup: (() => void) | undefined
      navigator.permissions.query({ name: 'notifications' }).then((status) => {
        const onChange = () => setPermission(Notification.permission)
        status.addEventListener('change', onChange)
        cleanup = () => status.removeEventListener('change', onChange)
      }).catch(() => { /* permissions API not available for notifications */ })
      return () => cleanup?.()
    }
  }, [])

  const request = useCallback(async (): Promise<Permission> => {
    if (!('Notification' in window)) return 'denied'
    const result = await Notification.requestPermission()
    setPermission(result)
    return result
  }, [])

  return { permission, request, isSupported }
}
