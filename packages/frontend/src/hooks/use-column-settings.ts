'use client'

import { useMemo, useCallback, useState, useRef, useEffect } from 'react'
import { usePreferences } from '@/hooks/use-preferences'
import type { ColumnSettings } from '@/lib/api-client'

export interface ColumnDef {
  id: string
  label: string
  /** Present when the column has been renamed: the original default label */
  originalLabel?: string
  defaultVisible?: boolean
  /** Column cannot be hidden */
  locked?: boolean
  defaultWidth?: number
  minWidth?: number
  sortKey?: string
}

interface UseColumnSettingsReturn {
  /** Visible columns in display order (label already reflects any active rename) */
  visibleColumns: ColumnDef[]
  /** All columns in display order (label already reflects any active rename) */
  allColumns: ColumnDef[]
  /** Check if a column is visible */
  isVisible: (columnId: string) => boolean
  /** Toggle column visibility */
  toggleColumn: (columnId: string) => void
  /** Get width for a column (px or undefined for auto) */
  getWidth: (columnId: string) => number | undefined
  /** Set width for a column */
  setWidth: (columnId: string, width: number) => void
  /** Move column to a new index in the visible list */
  moveColumn: (columnId: string, newIndex: number) => void
  /** Rename a column label. Pass empty string or the original label to remove the rename. */
  renameColumn: (columnId: string, newLabel: string) => void
  /** Reset to defaults (clears visibility, order, widths, and renames) */
  resetColumns: () => void
}

export function useColumnSettings(
  listKey: string,
  columns: ColumnDef[]
): UseColumnSettingsReturn {
  const { preferences, updatePreferences } = usePreferences()

  const settings: ColumnSettings | undefined = preferences.columnSettings?.[listKey]

  const defaultVisible = useMemo(
    () => columns.filter((c) => c.defaultVisible !== false).map((c) => c.id),
    [columns]
  )

  const defaultOrder = useMemo(() => columns.map((c) => c.id), [columns])

  const currentVisible = useMemo(
    () => settings?.visible ?? defaultVisible,
    [settings?.visible, defaultVisible]
  )

  // Reconcile saved order with the current registry: any column that exists in
  // the registry but is missing from the saved order (e.g. newly added columns)
  // gets inserted at its natural registry position, right after the closest
  // preceding registry column that is already present in the saved order.
  const currentOrder = useMemo(() => {
    const savedOrder = settings?.order
    if (!savedOrder) return defaultOrder

    const savedSet = new Set(savedOrder)
    const missing = defaultOrder.filter((id) => !savedSet.has(id))
    if (missing.length === 0) return savedOrder

    const reconciled = [...savedOrder]
    for (const missingId of missing) {
      const registryIdx = defaultOrder.indexOf(missingId)
      let insertAt = reconciled.length
      for (let i = registryIdx - 1; i >= 0; i--) {
        const prevId = defaultOrder[i]!
        const idx = reconciled.indexOf(prevId)
        if (idx !== -1) { insertAt = idx + 1; break }
      }
      reconciled.splice(insertAt, 0, missingId)
    }
    return reconciled
  }, [settings?.order, defaultOrder])

  const currentRenames = useMemo(
    () => settings?.renames ?? {},
    [settings?.renames]
  )

  const serverWidths = useMemo(
    () => settings?.widths ?? {},
    [settings?.widths]
  )

  // Local width overrides — applied instantly, persisted after debounce
  const [localWidths, setLocalWidths] = useState<Record<string, number>>({})
  const effectiveWidths = useMemo(
    () => ({ ...serverWidths, ...localWidths }),
    [serverWidths, localWidths]
  )

  // Debounced persistence for width changes
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingWidths = useRef<Record<string, number>>(effectiveWidths)
  // Keep ref in sync synchronously so debounced callback always sees latest widths
  pendingWidths.current = effectiveWidths

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

  // All columns sorted by current order, with active renames applied to label.
  // When a rename is active, originalLabel holds the default label so the UI
  // can display it as placeholder text.
  const allColumns = useMemo(() => {
    const orderMap = new Map(currentOrder.map((id, i) => [id, i]))
    return [...columns]
      .sort((a, b) => {
        const ai = orderMap.get(a.id) ?? 999
        const bi = orderMap.get(b.id) ?? 999
        return ai - bi
      })
      .map((c) => {
        const rename = currentRenames[c.id]
        return rename
          ? { ...c, label: rename, originalLabel: c.label }
          : { ...c, originalLabel: undefined }
      })
  }, [columns, currentOrder, currentRenames])

  const visibleSet = useMemo(() => new Set(currentVisible), [currentVisible])

  // Visible columns in order
  const visibleColumns = useMemo(
    () => allColumns.filter((c) => visibleSet.has(c.id)),
    [allColumns, visibleSet]
  )

  const isVisible = useCallback(
    (columnId: string) => visibleSet.has(columnId),
    [visibleSet]
  )

  const persist = useCallback(
    (patch: Partial<ColumnSettings>) => {
      const current = preferences.columnSettings ?? {}
      const base: ColumnSettings = {
        visible: currentVisible,
        order: currentOrder,
        widths: pendingWidths.current,
        renames: currentRenames,
      }
      const merged = {
        ...current,
        [listKey]: { ...base, ...patch },
      }
      updatePreferences({ columnSettings: merged })
    },
    [preferences.columnSettings, listKey, currentVisible, currentOrder, currentRenames, updatePreferences]
  )

  const toggleColumn = useCallback(
    (columnId: string) => {
      const col = columns.find((c) => c.id === columnId)
      if (col?.locked) return

      const next = currentVisible.includes(columnId)
        ? currentVisible.filter((id) => id !== columnId)
        : [...currentVisible, columnId]
      persist({ visible: next })
    },
    [columns, currentVisible, persist]
  )

  const setWidth = useCallback(
    (columnId: string, width: number) => {
      const col = columns.find((c) => c.id === columnId)
      const min = col?.minWidth ?? 60
      const clamped = Math.max(width, min)

      // Instant local update for responsive UI
      setLocalWidths((prev) => ({ ...prev, [columnId]: clamped }))

      // Debounce the API persistence
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        debounceTimer.current = null
        persist({ widths: pendingWidths.current })
      }, 500)
    },
    [columns, persist]
  )

  const moveColumn = useCallback(
    (columnId: string, newIndex: number) => {
      const order = [...currentOrder]
      const oldIndex = order.indexOf(columnId)
      if (oldIndex === -1) return
      order.splice(oldIndex, 1)
      order.splice(newIndex, 0, columnId)
      persist({ order })
    },
    [currentOrder, persist]
  )

  const renameColumn = useCallback(
    (columnId: string, newLabel: string) => {
      const originalLabel = columns.find((c) => c.id === columnId)?.label ?? ''
      const trimmed = newLabel.trim()
      const next = { ...currentRenames }
      if (trimmed && trimmed !== originalLabel) {
        next[columnId] = trimmed
      } else {
        delete next[columnId]
      }
      persist({ renames: next })
    },
    [columns, currentRenames, persist]
  )

  const getWidth = useCallback(
    (columnId: string) => effectiveWidths[columnId],
    [effectiveWidths]
  )

  const resetColumns = useCallback(() => {
    setLocalWidths({})
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
    persist({ visible: defaultVisible, order: defaultOrder, widths: {}, renames: {} })
  }, [defaultVisible, defaultOrder, persist])

  return {
    visibleColumns,
    allColumns,
    isVisible,
    toggleColumn,
    getWidth,
    setWidth,
    moveColumn,
    renameColumn,
    resetColumns,
  }
}
