'use client'

import { useCallback } from 'react'
import { usePreferences } from '@/hooks/use-preferences'

const DEFAULT_PAGE_SIZE = 10
const ALLOWED_PAGE_SIZES = [10, 20, 50, 100, 200] as const

export type AllowedPageSize = (typeof ALLOWED_PAGE_SIZES)[number]

function isAllowedPageSize(value: number): value is AllowedPageSize {
  return (ALLOWED_PAGE_SIZES as readonly number[]).includes(value)
}

/**
 * Returns the user's persisted page-size preference and a setter that
 * writes it back to the server-side user preferences.
 *
 * The value is shared across every paginated list in the app because it
 * is stored in `UserPreferences.pageSize`.  If the stored value is
 * missing or invalid the hook falls back to `DEFAULT_PAGE_SIZE` (10).
 */
export function usePageSize() {
  const { preferences, updatePreferences } = usePreferences()

  const raw = preferences.pageSize
  const pageSize: AllowedPageSize =
    typeof raw === 'number' && isAllowedPageSize(raw) ? raw : DEFAULT_PAGE_SIZE

  const setPageSize = useCallback(
    (size: AllowedPageSize) => {
      updatePreferences({ pageSize: size })
    },
    [updatePreferences],
  )

  return { pageSize, setPageSize } as const
}
