import { useState, useCallback, useMemo } from 'react'

/**
 * Hook for managing row selection state across views.
 * Uses a Map<string, T> internally so that selected items (full objects)
 * are always available — even when the source view changes or re-fetches.
 */
export function useRowSelection<T extends { id: string }>() {
  const [selectedMap, setSelectedMap] = useState<Map<string, T>>(new Map())

  const selectedIds = useMemo(
    () => new Set(selectedMap.keys()),
    [selectedMap],
  )

  const selectedItems = useMemo(
    () => Array.from(selectedMap.values()),
    [selectedMap],
  )

  const toggleOne = useCallback((item: T) => {
    setSelectedMap((prev) => {
      const next = new Map(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.set(item.id, item)
      return next
    })
  }, [])

  /**
   * Toggle an entire bucket of items.
   * If all items are already selected → deselect them.
   * Otherwise → add all of them (additive, keeps other selections).
   */
  const toggleBucket = useCallback((items: T[]) => {
    setSelectedMap((prev) => {
      const allSelected = items.length > 0 && items.every((i) => prev.has(i.id))
      const next = new Map(prev)
      if (allSelected) {
        for (const item of items) next.delete(item.id)
      } else {
        for (const item of items) next.set(item.id, item)
      }
      return next
    })
  }, [])

  const isBucketAllSelected = useCallback(
    (items: T[]) => items.length > 0 && items.every((i) => selectedMap.has(i.id)),
    [selectedMap],
  )

  const isBucketIndeterminate = useCallback(
    (items: T[]) => {
      if (items.length === 0) return false
      const count = items.filter((i) => selectedMap.has(i.id)).length
      return count > 0 && count < items.length
    },
    [selectedMap],
  )

  const clearSelection = useCallback(() => {
    setSelectedMap((prev) => prev.size > 0 ? new Map() : prev)
  }, [])

  return {
    selectedIds,
    selectedItems,
    selectedCount: selectedMap.size,
    toggleOne,
    toggleBucket,
    isBucketAllSelected,
    isBucketIndeterminate,
    clearSelection,
  }
}
