'use client'

import { useCallback, useRef, useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TableHead } from '@/components/ui/table'

interface ResizableTableHeadProps {
  children: React.ReactNode
  width?: number
  minWidth?: number
  onResize?: (width: number) => void
  sortable?: boolean
  sorted?: 'asc' | 'desc' | false
  onSort?: () => void
  className?: string
}

export function ResizableTableHead({
  children,
  width,
  minWidth = 60,
  onResize,
  sortable = false,
  sorted = false,
  onSort,
  className,
}: ResizableTableHeadProps) {
  const thRef = useRef<HTMLTableCellElement>(null)
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  // Set to true when a mousedown on the resize handle occurs so the
  // following click event (fired by the browser after mouseup) does not
  // accidentally trigger the sort handler.
  const resizeActiveRef = useRef(false)

  const effectiveWidth = dragWidth ?? width

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      resizeActiveRef.current = true

      const startX = e.clientX
      // Use the CSS width prop (not offsetWidth) so diff=0 means no change.
      // offsetWidth includes extra space distributed by table-layout:fixed,
      // which would cause a jump when applied back as CSS width.
      const startWidth = width ?? thRef.current?.getBoundingClientRect().width ?? 150

      const handleMouseMove = (ev: MouseEvent) => {
        const diff = ev.clientX - startX
        const newWidth = Math.max(startWidth + diff, minWidth)
        setDragWidth(newWidth)
      }

      const handleMouseUp = (ev: MouseEvent) => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''

        const diff = ev.clientX - startX
        const finalWidth = Math.max(startWidth + diff, minWidth)
        onResize?.(finalWidth)
        setDragWidth(null)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [width, minWidth, onResize]
  )

  return (
    <TableHead
      ref={thRef}
      style={effectiveWidth ? { width: `${effectiveWidth}px`, minWidth: `${minWidth}px` } : { minWidth: `${minWidth}px` }}
      className={cn('relative group', sortable && 'cursor-pointer select-none', className)}
      onClick={sortable ? () => {
        if (resizeActiveRef.current) {
          resizeActiveRef.current = false
          return
        }
        onSort?.()
      } : undefined}
    >
      <div className="flex items-center gap-1">
        {children}
        {sorted === 'asc' && <ChevronUp className="h-3 w-3" />}
        {sorted === 'desc' && <ChevronDown className="h-3 w-3" />}
      </div>
      {onResize && (
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={handleMouseDown}
          className="absolute right-0 top-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-primary/30 group-hover:bg-border"
        />
      )}
    </TableHead>
  )
}
