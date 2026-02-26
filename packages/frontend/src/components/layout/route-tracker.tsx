'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { usePreferences } from '@/hooks/use-preferences'

/**
 * Tracks the current route and saves it to user preferences.
 * Debounced: only saves when the user stays on a route for at least 2 seconds.
 * This avoids firing a PATCH request on every rapid navigation.
 */
export function RouteTracker() {
  const pathname = usePathname()
  const { updatePreferences } = usePreferences()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (pathname) {
        updatePreferences({ lastRoute: pathname })
      }
    }, 2000)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [pathname, updatePreferences])

  return null
}
