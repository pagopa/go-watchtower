'use client'

import { memo } from 'react'
import {
  TableCell,
  TableRow,
} from '@/components/ui/table'
import type { ColumnDef } from '@/hooks/use-column-settings'
import type { AlarmAnalysis } from '@/lib/api-client'
import type { ValidationResult, QualityResult } from '@/lib/analysis-validation'
import { ValidationScoreBadge } from '@/components/analysis/validation-score-badge'
import { AnalysisCell } from '../_helpers/cell-renderers'
import { AnalysisRowActions } from './analysis-row-actions'

export interface AnalysisTableRowProps {
  analysis: AlarmAnalysis
  isSelected: boolean
  isLingering: boolean
  visibleColumns: ColumnDef[]
  getWidth: (id: string) => number | undefined
  hasActions: boolean
  showEditAction: boolean
  isLocked: boolean
  showDeleteAction: boolean
  lockDays: number | null
  validationData: { validation: ValidationResult; quality: QualityResult } | undefined
  onRowClick: (analysis: AlarmAnalysis) => void
  onEdit: (analysis: AlarmAnalysis) => void
  onDelete: (analysis: AlarmAnalysis) => void
  onValidationClick: (analysis: AlarmAnalysis) => void
}

export const AnalysisTableRow = memo(function AnalysisTableRow({
  analysis,
  isSelected,
  isLingering,
  visibleColumns,
  getWidth,
  hasActions,
  showEditAction,
  isLocked,
  showDeleteAction,
  lockDays,
  validationData,
  onRowClick,
  onEdit,
  onDelete,
  onValidationClick,
}: AnalysisTableRowProps) {
  return (
    <TableRow
      className={
        'group cursor-pointer border-b border-border/50 ' +
        (isSelected
          ? 'analysis-row-selected hover:bg-primary/[0.09]'
          : isLingering
            ? 'analysis-row-lingering hover:bg-muted/30'
            : 'transition-colors hover:bg-muted/30')
      }
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        onRowClick(analysis)
      }}
    >
      {visibleColumns.map((col, colIdx) => {
        const isLastDataCol = colIdx === visibleColumns.length - 1
        return (
          <TableCell
            key={col.id}
            className="overflow-hidden py-2.5"
            style={(!isLastDataCol && getWidth(col.id)) ? { width: `${getWidth(col.id)}px` } : undefined}
          >
            {col.id === 'validation' && validationData ? (
              <ValidationScoreBadge
                validation={validationData.validation}
                quality={validationData.quality}
                onClick={() => onValidationClick(analysis)}
              />
            ) : col.id !== 'validation' ? (
              <AnalysisCell columnId={col.id} analysis={analysis} />
            ) : null}
          </TableCell>
        )
      })}
      {hasActions && (
        <TableCell className={
          'relative sticky right-0 z-10 border-l border-border/40 py-2 ' +
          (isSelected
            ? 'bg-primary/[0.07] group-hover:bg-primary/[0.09]'
            : 'bg-card group-hover:bg-muted')
        }>
          <AnalysisRowActions
            analysis={analysis}
            canEdit={showEditAction && !isLocked}
            isLocked={showEditAction && isLocked}
            canDelete={showDeleteAction}
            lockDays={lockDays}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </TableCell>
      )}
    </TableRow>
  )
})
