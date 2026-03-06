import { useMemo } from 'react'
import type { ColumnDef } from '@/hooks/use-column-settings'

/**
 * Computes the minimum table width for horizontal scroll based on visible columns.
 * Shared across all paginated list pages.
 */
export function useTableMinWidth(
  visibleColumns: ColumnDef[],
  getWidth: (id: string) => number | undefined,
  hasActions: boolean,
): number {
  return useMemo(() => {
    if (visibleColumns.length === 0) return 0
    const lastIdx = visibleColumns.length - 1
    const nonLastSum = visibleColumns
      .slice(0, lastIdx)
      .reduce((sum, col) => sum + (getWidth(col.id) ?? col.defaultWidth ?? 150), 0)
    const lastCol = visibleColumns[lastIdx]
    const lastColMin = lastCol
      ? (getWidth(lastCol.id) ?? lastCol.defaultWidth ?? lastCol.minWidth ?? 80)
      : 80
    const actionsWidth = hasActions ? 80 : 0
    return nonLastSum + lastColMin + actionsWidth
  }, [visibleColumns, getWidth, hasActions])
}
