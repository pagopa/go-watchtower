'use client'

import { memo } from 'react'
import { MoreHorizontal, Plus, Link2, Unlink, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AlarmEvent } from '@/lib/api-client'

export interface AlarmEventRowActionsProps {
  event: AlarmEvent
  canWrite: boolean
  canDelete: boolean
  onEdit: (e: AlarmEvent) => void
  onDelete: (e: AlarmEvent) => void
  onCreateAnalysis?: (e: AlarmEvent) => void
  onAssociateAnalysis?: (e: AlarmEvent) => void
  onUnlinkAnalysis?: (e: AlarmEvent) => void
}

export const AlarmEventRowActions = memo(function AlarmEventRowActions({
  event, canWrite, canDelete, onEdit, onDelete,
  onCreateAnalysis, onAssociateAnalysis, onUnlinkAnalysis,
}: AlarmEventRowActionsProps) {
  const isLinked = !!event.analysisId
  const hasAnalysisActions = isLinked ? !!onUnlinkAnalysis : (!!onCreateAnalysis && !!onAssociateAnalysis)
  const hasEventActions = canWrite || canDelete

  if (!hasAnalysisActions && !hasEventActions) return null

  return (
    <div className="flex justify-end opacity-0 transition-opacity group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
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
    </div>
  )
})
