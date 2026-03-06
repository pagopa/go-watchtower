import { useState, useCallback } from 'react'

/**
 * Manages sort state for server-side sorted tables.
 */
export function useSort(defaultSortBy: string, defaultOrder: 'asc' | 'desc' = 'desc') {
  const [sortBy, setSortBy] = useState(defaultSortBy)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(defaultOrder)

  const handleSort = useCallback((column: string) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }, [sortBy])

  return { sortBy, sortOrder, handleSort }
}
