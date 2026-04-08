'use client'

import { memo } from 'react'
import {
  TableCell,
  TableRow,
} from '@/components/ui/table'
import type { ColumnDef } from '@/hooks/use-column-settings'
import type { AlarmEvent } from '@/lib/api-client'
import { AlarmEventCell, isHighPriorityEvent } from '../_helpers/cell-renderers'
import { AlarmEventRowActions } from './alarm-event-row-actions'

type EmbeddedAlarm = NonNullable<AlarmEvent['alarm']>

export interface AlarmEventTableRowProps {
  event: AlarmEvent
  isChecked: boolean
  isDetailSelected: boolean
  isLingering: boolean
  isOnCall: boolean
  visibleColumns: ColumnDef[]
  getWidth: (id: string) => number | undefined
  canWrite: boolean
  canDelete: boolean
  canWriteAnalysis: boolean
  onRowClick: (event: AlarmEvent) => void
  onToggleSelect: (event: AlarmEvent) => void
  onEdit: (event: AlarmEvent) => void
  onDelete: (event: AlarmEvent) => void
  onAlarmClick: (alarm: EmbeddedAlarm, productId: string) => void
  onCreateAnalysis: (event: AlarmEvent) => void
  onCreateIgnorableAnalysis: (event: AlarmEvent) => void
  onAssociateAnalysis: (event: AlarmEvent) => void
  onUnlinkAnalysis: (event: AlarmEvent) => void
}

export const AlarmEventTableRow = memo(function AlarmEventTableRow({
  event,
  isChecked,
  isDetailSelected,
  isLingering,
  isOnCall,
  visibleColumns,
  getWidth,
  canWrite,
  canDelete,
  canWriteAnalysis,
  onRowClick,
  onToggleSelect,
  onEdit,
  onDelete,
  onAlarmClick,
  onCreateAnalysis,
  onCreateIgnorableAnalysis,
  onAssociateAnalysis,
  onUnlinkAnalysis,
}: AlarmEventTableRowProps) {
  return (
    <TableRow
      className={
        'group cursor-pointer border-b border-border/50 ' +
        (isChecked
          ? 'bg-primary/[0.05] hover:bg-primary/[0.08]'
          : isDetailSelected
            ? 'analysis-row-selected hover:bg-primary/[0.09]'
            : isLingering
              ? 'analysis-row-lingering hover:bg-muted/30'
              : isOnCall
                ? 'bg-rose-500/[0.04] hover:bg-rose-500/[0.06] transition-colors border-l-[3px] border-l-rose-500/60'
                : isHighPriorityEvent(event)
                  ? 'bg-amber-500/[0.04] hover:bg-amber-500/[0.06] transition-colors border-l-[3px] border-l-amber-500/60'
                  : 'transition-colors hover:bg-muted/30')
      }
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input[type="checkbox"]')) return
        onRowClick(event)
      }}
    >
      <TableCell className="w-10 px-2 py-2.5">
        <input
          type="checkbox"
          aria-label={`Seleziona ${event.name}`}
          className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
          checked={isChecked}
          onChange={() => onToggleSelect(event)}
        />
      </TableCell>
      {visibleColumns.map((col, colIdx) => {
        const isLastDataCol = colIdx === visibleColumns.length - 1
        return (
          <TableCell
            key={col.id}
            className="overflow-hidden py-2.5"
            style={(!isLastDataCol && getWidth(col.id)) ? { width: `${getWidth(col.id)}px` } : undefined}
          >
            <AlarmEventCell columnId={col.id} event={event} isOnCall={isOnCall} onAlarmClick={onAlarmClick} />
          </TableCell>
        )
      })}
      {(canWrite || canDelete || canWriteAnalysis) && (
        <TableCell className={
          'relative sticky right-0 z-10 border-l border-border/40 py-2 ' +
          (isDetailSelected
            ? 'bg-primary/[0.07] group-hover:bg-primary/[0.09]'
            : 'bg-card group-hover:bg-muted')
        }>
          <AlarmEventRowActions
            event={event}
            canWrite={canWrite}
            canDelete={canDelete}
            onEdit={onEdit}
            onDelete={onDelete}
            onCreateAnalysis={canWriteAnalysis ? onCreateAnalysis : undefined}
            onCreateIgnorableAnalysis={canWriteAnalysis ? onCreateIgnorableAnalysis : undefined}
            onAssociateAnalysis={canWriteAnalysis ? onAssociateAnalysis : undefined}
            onUnlinkAnalysis={canWriteAnalysis ? onUnlinkAnalysis : undefined}
          />
        </TableCell>
      )}
    </TableRow>
  )
})
