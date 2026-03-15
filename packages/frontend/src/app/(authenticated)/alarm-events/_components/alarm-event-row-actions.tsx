'use client'

import { memo } from 'react'
import { MoreHorizontal, Plus, EyeOff, Link2, Unlink, Pencil, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AlarmEvent } from '@/lib/api-client'

interface AlarmEventRowActionsProps {
  event: AlarmEvent
  canWrite: boolean
  canDelete: boolean
  onEdit: (e: AlarmEvent) => void
  onDelete: (e: AlarmEvent) => void
  onCreateAnalysis?: (e: AlarmEvent) => void
  onCreateIgnorableAnalysis?: (e: AlarmEvent) => void
  onAssociateAnalysis?: (e: AlarmEvent) => void
  onUnlinkAnalysis?: (e: AlarmEvent) => void
}

export const AlarmEventRowActions = memo(function AlarmEventRowActions({
  event, canWrite, canDelete, onEdit, onDelete,
  onCreateAnalysis, onCreateIgnorableAnalysis, onAssociateAnalysis, onUnlinkAnalysis,
}: AlarmEventRowActionsProps) {
  const isLinked = !!event.analysisId
  const hasAnalysisActions = isLinked ? !!onUnlinkAnalysis : (!!onCreateAnalysis && !!onCreateIgnorableAnalysis && !!onAssociateAnalysis)
  const hasEventActions = canWrite || canDelete

  if (!hasAnalysisActions && !hasEventActions) return null

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
          {hasAnalysisActions && (
            <>
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                Analisi
              </DropdownMenuLabel>
              {isLinked ? (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUnlinkAnalysis!(event) }}>
                  <Unlink className="h-4 w-4" />
                  Scollega da analisi
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCreateAnalysis!(event) }}>
                    <Plus className="h-4 w-4" />
                    Crea analisi
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCreateIgnorableAnalysis!(event) }}>
                    <EyeOff className="h-4 w-4" />
                    Crea analisi da ignorare
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAssociateAnalysis!(event) }}>
                    <Link2 className="h-4 w-4" />
                    Associa ad analisi
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
          {hasAnalysisActions && hasEventActions && <DropdownMenuSeparator />}
          {canWrite && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(event) }}>
              <Pencil className="h-4 w-4" />
              Modifica
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onDelete(event) }}
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
