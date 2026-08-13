'use client'

import { memo } from 'react'
import {
  TableCell,
  TableRow,
} from '@/components/ui/table'
import type { ColumnDef } from '@/hooks/use-column-settings'
import type { AlarmEvent } from '@/lib/api-client'
import { AlarmEventCell } from '../_helpers/cell-renderers'
import {
  alarmEventActionsCellClassName,
  alarmEventRowClassName,
  hasRowActions,
  type AlarmEventPermissions,
  type AlarmEventRowState,
} from '../_lib/row-appearance'
import { AlarmEventRowActions } from './alarm-event-row-actions'

type EmbeddedAlarm = NonNullable<AlarmEvent['alarm']>

export interface AlarmEventTableRowProps {
  event: AlarmEvent
  /** Resolved once by `resolveAlarmEventRowState` — see `_lib/row-appearance`. */
  state: AlarmEventRowState
  permissions: AlarmEventPermissions
  visibleColumns: ColumnDef[]
  getWidth: (id: string) => number | undefined
  onRowClick: (event: AlarmEvent) => void
  onToggleSelect: (event: AlarmEvent) => void
  onEdit: (event: AlarmEvent) => void
  onDelete: (event: AlarmEvent) => void
  onAlarmClick?: (alarm: EmbeddedAlarm, productId: string) => void
  onCreateAnalysis?: (event: AlarmEvent) => void
  onCreateIgnorableAnalysis?: (event: AlarmEvent) => void
  onAssociateAnalysis?: (event: AlarmEvent) => void
  onUnlinkAnalysis?: (event: AlarmEvent) => void
  /** Indents the first data cell, for events nested under a group header. */
  indented?: boolean
  /** Virtualizer bookkeeping — set when the row is measured by TanStack Virtual. */
  ref?: React.Ref<HTMLTableRowElement>
  dataIndex?: number
}

export const AlarmEventTableRow = memo(function AlarmEventTableRow({
  event,
  state,
  permissions,
  visibleColumns,
  getWidth,
  onRowClick,
  onToggleSelect,
  onEdit,
  onDelete,
  onAlarmClick,
  onCreateAnalysis,
  onCreateIgnorableAnalysis,
  onAssociateAnalysis,
  onUnlinkAnalysis,
  indented,
  ref,
  dataIndex,
}: AlarmEventTableRowProps) {
  const { writeAnalysis } = permissions

  return (
    <TableRow
      ref={ref}
      data-index={dataIndex}
      className={alarmEventRowClassName(state.variant)}
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
          checked={state.checked}
          onChange={() => onToggleSelect(event)}
        />
      </TableCell>
      {visibleColumns.map((col, colIdx) => {
        const isLastDataCol = colIdx === visibleColumns.length - 1
        const width = getWidth(col.id)
        const indent = indented && colIdx === 0 ? { paddingLeft: '2rem' } : undefined
        return (
          <TableCell
            key={col.id}
            className="overflow-hidden py-2.5"
            style={(!isLastDataCol && width) ? { width: `${width}px`, ...indent } : indent}
          >
            <AlarmEventCell
              columnId={col.id}
              event={event}
              isOnCall={state.onCall}
              isIgnored={state.ignored}
              onAlarmClick={onAlarmClick}
            />
          </TableCell>
        )
      })}
      {hasRowActions(permissions) && (
        <TableCell className={alarmEventActionsCellClassName(state.detailSelected)}>
          <AlarmEventRowActions
            event={event}
            canWrite={permissions.write}
            canDelete={permissions.delete}
            onEdit={onEdit}
            onDelete={onDelete}
            onCreateAnalysis={writeAnalysis ? onCreateAnalysis : undefined}
            onCreateIgnorableAnalysis={writeAnalysis ? onCreateIgnorableAnalysis : undefined}
            onAssociateAnalysis={writeAnalysis ? onAssociateAnalysis : undefined}
            onUnlinkAnalysis={writeAnalysis ? onUnlinkAnalysis : undefined}
          />
        </TableCell>
      )}
    </TableRow>
  )
})
