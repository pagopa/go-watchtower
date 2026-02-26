'use client'

import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TableHead } from '@/components/ui/table'
import type { SortConfig } from '@/hooks/use-sortable'

interface SortableTableHeadProps<K extends string> {
  columnKey: K
  sortConfig: SortConfig<K>
  onSort: (key: K) => void
  children: React.ReactNode
  className?: string
}

export function SortableTableHead<K extends string>({
  columnKey,
  sortConfig,
  onSort,
  children,
  className,
}: SortableTableHeadProps<K>) {
  const isActive = sortConfig.key === columnKey
  const Icon = isActive
    ? sortConfig.direction === 'asc'
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown

  return (
    <TableHead
      className={cn('cursor-pointer select-none', className)}
      onClick={() => onSort(columnKey)}
    >
      <div className="flex items-center gap-1">
        {children}
        <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-foreground' : 'text-muted-foreground/50')} />
      </div>
    </TableHead>
  )
}
