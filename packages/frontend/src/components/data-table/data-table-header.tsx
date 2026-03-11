'use client'

import { TableHeader, TableRow } from '@/components/ui/table'
import { ResizableTableHead } from '@/components/ui/resizable-table-head'
import type { ColumnDef } from '@/hooks/use-column-settings'

interface DataTableHeaderProps {
  columns: ColumnDef[]
  getWidth: (id: string) => number | undefined
  setWidth?: (id: string, width: number) => void
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  onSort?: (column: string) => void
  hasActions?: boolean
  actionsWidth?: number
  actionsLabel?: string
  className?: string
  prependContent?: React.ReactNode
}

export function DataTableHeader({
  columns, getWidth, setWidth, sortBy, sortOrder, onSort, hasActions, actionsWidth = 48, actionsLabel = 'Azioni', className, prependContent,
}: DataTableHeaderProps) {
  return (
    <TableHeader className={className}>
      <TableRow className="bg-muted/30 hover:bg-muted/30 border-b">
        {prependContent}
        {columns.map((col, idx) => {
          const isLast = idx === columns.length - 1
          return (
            <ResizableTableHead
              key={col.id}
              width={isLast ? undefined : (getWidth(col.id) ?? col.defaultWidth)}
              minWidth={isLast
                ? (getWidth(col.id) ?? col.defaultWidth ?? col.minWidth)
                : col.minWidth}
              onResize={setWidth ? (w) => setWidth(col.id, w) : undefined}
              sortable={!!col.sortKey && !!onSort}
              sorted={col.sortKey && sortBy === col.sortKey ? sortOrder : false}
              onSort={col.sortKey && onSort ? () => onSort(col.sortKey!) : undefined}
            >
              {col.label}
            </ResizableTableHead>
          )
        })}
        {hasActions && (
          <ResizableTableHead
            width={actionsWidth}
            minWidth={actionsWidth}
            className="sticky right-0 z-10 border-l border-border/40 bg-muted text-right"
          >
            <span className="sr-only">{actionsLabel}</span>
          </ResizableTableHead>
        )}
      </TableRow>
    </TableHeader>
  )
}
