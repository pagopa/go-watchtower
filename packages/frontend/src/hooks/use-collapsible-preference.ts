import { useState, useCallback } from 'react'
import { usePreferences } from './use-preferences'
import type { UserPreferences } from '@/lib/api-client'

/**
 * Manages a collapsible state synced with user preferences.
 * Provides immediate toggle (no round-trip) with background persistence.
 */
export function useCollapsiblePreference(
  preferenceKey: keyof UserPreferences,
  defaultValue = true,
) {
  const { preferences, updatePreferences } = usePreferences()

  // null = user hasn't toggled yet this session, use server preference
  const [override, setOverride] = useState<boolean | null>(null)

  const collapsed = override !== null
    ? override
    : ((preferences[preferenceKey] as boolean | undefined) ?? defaultValue)

  const toggle = useCallback(() => {
    const next = !collapsed
    setOverride(next)
    updatePreferences({ [preferenceKey]: next })
  }, [collapsed, preferenceKey, updatePreferences])

  return { collapsed, toggle }
}
