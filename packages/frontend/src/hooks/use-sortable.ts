'use client'

import { useMemo, useState } from 'react'
import type { SortDirection } from '@go-watchtower/shared'

export type { SortDirection }

export interface SortConfig<K extends string> {
  key: K
  direction: SortDirection
}

export function useSortable<T, K extends string>(
  data: T[] | undefined,
  defaultKey: K,
  defaultDirection: SortDirection = 'asc'
) {
  const [sortConfig, setSortConfig] = useState<SortConfig<K>>({
    key: defaultKey,
    direction: defaultDirection,
  })

  const requestSort = (key: K) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  const sortedData = useMemo(() => {
    if (!data) return undefined
    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortConfig.key]
      const bVal = (b as Record<string, unknown>)[sortConfig.key]

      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      let comparison = 0
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal
      } else if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
        comparison = aVal === bVal ? 0 : aVal ? -1 : 1
      } else {
        comparison = String(aVal).localeCompare(String(bVal), 'it', { sensitivity: 'base' })
      }

      return sortConfig.direction === 'asc' ? comparison : -comparison
    })
  }, [data, sortConfig])

  return { sortedData, sortConfig, requestSort }
}
