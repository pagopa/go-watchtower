import { useState, useCallback, useMemo } from 'react'

/**
 * Hook for managing row selection state in tables.
 * Returns stable callbacks and memoized derived values.
 */
export function useRowSelection<T extends { id: string }>(items: T[] | undefined) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (!items) return
    setSelectedIds((prev) => {
      if (prev.size === items.length) return new Set()
      return new Set(items.map((e) => e.id))
    })
  }, [items])

  const clearSelection = useCallback(() => {
    setSelectedIds((prev) => prev.size > 0 ? new Set() : prev)
  }, [])

  const selectedItems = useMemo(
    () => items?.filter((e) => selectedIds.has(e.id)) ?? [],
    [items, selectedIds]
  )

  const isAllSelected = !!items && items.length > 0 && selectedIds.size === items.length
  const isIndeterminate = selectedIds.size > 0 && (!items || selectedIds.size < items.length)

  return {
    selectedIds,
    selectedItems,
    isAllSelected,
    isIndeterminate,
    toggleOne,
    toggleAll,
    clearSelection,
  }
}
