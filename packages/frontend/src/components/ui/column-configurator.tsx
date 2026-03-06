'use client'

import { Settings2, GripVertical, RotateCcw, Pencil, Check, X } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ColumnDef } from '@/hooks/use-column-settings'

interface ColumnConfiguratorProps {
  allColumns: ColumnDef[]
  isVisible: (columnId: string) => boolean
  toggleColumn: (columnId: string) => void
  moveColumn: (columnId: string, newIndex: number) => void
  renameColumn: (columnId: string, newLabel: string) => void
  resetColumns: () => void
}

export function ColumnConfigurator({
  allColumns,
  isVisible,
  toggleColumn,
  moveColumn,
  renameColumn,
  resetColumns,
}: ColumnConfiguratorProps) {
  // Drag state
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Rename state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const getDropIndex = useCallback(
    (clientY: number) => {
      if (!listRef.current) return null
      const items = listRef.current.querySelectorAll<HTMLElement>('[data-col-id]')
      for (let i = 0; i < items.length; i++) {
        const rect = items[i].getBoundingClientRect()
        const mid = rect.top + rect.height / 2
        if (clientY < mid) return i
      }
      return items.length
    },
    []
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, columnId: string) => {
      if (editingId) return
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      setDragId(columnId)
      setDropIndex(null)
    },
    [editingId]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragId) return
      const idx = getDropIndex(e.clientY)
      setDropIndex(idx)
    },
    [dragId, getDropIndex]
  )

  const handlePointerUp = useCallback(() => {
    if (dragId && dropIndex !== null) {
      const sourceIndex = allColumns.findIndex((c) => c.id === dragId)
      const targetIndex = dropIndex > sourceIndex ? dropIndex - 1 : dropIndex
      if (sourceIndex !== -1 && targetIndex !== sourceIndex) {
        moveColumn(dragId, targetIndex)
      }
    }
    setDragId(null)
    setDropIndex(null)
  }, [dragId, dropIndex, allColumns, moveColumn])

  const startEdit = useCallback(
    (col: ColumnDef, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setEditingId(col.id)
      setEditingValue(col.label)
      // Focus the input on next tick after render
      setTimeout(() => inputRef.current?.select(), 0)
    },
    []
  )

  const confirmEdit = useCallback(
    (col: ColumnDef) => {
      renameColumn(col.id, editingValue)
      setEditingId(null)
    },
    [renameColumn, editingValue]
  )

  const cancelEdit = useCallback(() => {
    setEditingId(null)
  }, [])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Colonne
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Colonne visibili</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div
          ref={listRef}
          className="max-h-72 overflow-y-auto"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {allColumns.map((col, index) => {
            const isEditing = editingId === col.id
            const isRenamed = !!col.originalLabel

            return (
              <div key={col.id}>
                {/* Drop indicator before this item */}
                {dragId && dropIndex === index && dragId !== col.id && (
                  <div className="mx-2 h-0.5 rounded bg-primary" />
                )}
                <div
                  data-col-id={col.id}
                  className={cn(
                    'group flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm select-none',
                    !isEditing && 'hover:bg-accent cursor-default',
                    dragId === col.id && 'opacity-40'
                  )}
                >
                  {/* Grip handle */}
                  {!col.locked ? (
                    <GripVertical
                      className="h-3.5 w-3.5 shrink-0 opacity-40 cursor-grab active:cursor-grabbing touch-none"
                      onPointerDown={(e) => handlePointerDown(e, col.id)}
                    />
                  ) : (
                    <span className="w-3.5 shrink-0" />
                  )}

                  {/* Visibility checkbox */}
                  <input
                    type="checkbox"
                    checked={isVisible(col.id)}
                    onChange={() => !isEditing && toggleColumn(col.id)}
                    disabled={col.locked}
                    className="rounded border-input shrink-0"
                  />

                  {/* Label or inline edit input */}
                  {isEditing ? (
                    <input
                      ref={inputRef}
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={() => confirmEdit(col)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); confirmEdit(col) }
                        if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                      }}
                      placeholder={col.originalLabel ?? col.label}
                      className="flex-1 min-w-0 bg-transparent text-sm outline-none border-b border-primary pb-px"
                    />
                  ) : (
                    <span
                      className={cn(
                        'flex-1 min-w-0 truncate',
                        col.locked ? 'text-muted-foreground' : ''
                      )}
                      title={isRenamed ? `Nome originale: ${col.originalLabel}` : undefined}
                    >
                      {col.label}
                      {isRenamed && (
                        <span className="ml-1 text-[10px] text-primary/60">✎</span>
                      )}
                    </span>
                  )}

                  {/* Rename action button (hover only, hidden during drag/edit) */}
                  {!col.locked && !isEditing && !dragId && (
                    <button
                      type="button"
                      onClick={(e) => startEdit(col, e)}
                      className="shrink-0 rounded p-0.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground hover:bg-muted"
                      title="Rinomina colonna"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}

                  {/* Confirm/cancel buttons during edit */}
                  {isEditing && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); confirmEdit(col) }}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
                        title="Conferma"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); cancelEdit() }}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
                        title="Annulla"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {/* Drop indicator after last item */}
          {dragId && dropIndex === allColumns.length && (
            <div className="mx-2 h-0.5 rounded bg-primary" />
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-xs"
            onClick={resetColumns}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Ripristina predefinite
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
