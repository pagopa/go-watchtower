'use client'

import { memo } from 'react'
import { MoreHorizontal, Pencil, Trash2, Lock } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AlarmAnalysis } from '@/lib/api-client'

interface AnalysisRowActionsProps {
  analysis: AlarmAnalysis
  canEdit: boolean
  isLocked: boolean
  canDelete: boolean
  lockDays: number | null
  onEdit: (a: AlarmAnalysis) => void
  onDelete: (a: AlarmAnalysis) => void
}

export const AnalysisRowActions = memo(function AnalysisRowActions({
  analysis, canEdit, isLocked, canDelete, lockDays, onEdit, onDelete,
}: AnalysisRowActionsProps) {
  if (!canEdit && !isLocked && !canDelete) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div
          role="button"
          tabIndex={-1}
          className="absolute inset-0 flex cursor-pointer items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }}
        >
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
        {canEdit && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(analysis) }}>
            <Pencil className="h-4 w-4" />
            Modifica
          </DropdownMenuItem>
        )}
        {!canEdit && isLocked && (
          <DropdownMenuItem disabled className="opacity-50">
            <Lock className="h-4 w-4" />
            Bloccata dopo {lockDays} giorni
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onDelete(analysis) }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Elimina
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
