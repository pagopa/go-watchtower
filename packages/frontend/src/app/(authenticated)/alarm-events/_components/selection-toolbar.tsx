'use client'

import { Ban, ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

interface SelectionToolbarProps {
  selectedCount: number
  onBulkIgnore: () => void
  onClearSelection: () => void
  canWriteAnalysis: boolean
}

export function SelectionToolbar({
  selectedCount,
  onBulkIgnore,
  onClearSelection,
  canWriteAnalysis,
}: SelectionToolbarProps) {
  if (selectedCount === 0) return null

  return (
    <div
      className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 animate-in slide-in-from-bottom-4 fade-in duration-200"
    >
      <div className="flex items-center gap-2 rounded-full border bg-popover px-4 py-2 shadow-lg shadow-black/10 dark:shadow-black/30">
        {/* Count */}
        <span className="flex items-center gap-1.5 text-sm font-medium pl-1">
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-mono text-xs font-bold tabular-nums text-primary-foreground">
            {selectedCount}
          </span>
          <span className="text-muted-foreground">selezionati</span>
        </span>

        {/* Separator */}
        <div className="mx-1 h-5 w-px bg-border" />

        {/* Actions dropdown */}
        {canWriteAnalysis && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 rounded-full text-xs">
                Azioni
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top" sideOffset={8}>
              <DropdownMenuItem onClick={onBulkIgnore}>
                <Ban className="mr-2 h-3.5 w-3.5" />
                Crea analisi da ignorare
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Deselect */}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1 rounded-full text-xs text-muted-foreground hover:text-foreground"
          onClick={onClearSelection}
        >
          <X className="h-3.5 w-3.5" />
          Deseleziona
        </Button>
      </div>
    </div>
  )
}
