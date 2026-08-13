'use client'

import { memo } from 'react'
import {
  TableCell,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import type { ColumnDef } from '@/hooks/use-column-settings'
import type { AlarmAnalysis } from '@/lib/api-client'
import type { ValidationResult, QualityResult } from '@/lib/analysis-validation'
import { ValidationScoreBadge } from '@/components/analysis/validation-score-badge'
import { AnalysisCell } from '../_helpers/cell-renderers'
import {
  analysisActionsCellClassName,
  analysisRowClassName,
  type AnalysisRowActionsState,
  type AnalysisRowVariant,
} from '../_lib/row-appearance'
import { AnalysisRowActions } from './analysis-row-actions'

export interface AnalysisTableRowProps {
  analysis: AlarmAnalysis
  /** Resolved once by `resolveAnalysisRowVariant` — see `_lib/row-appearance`. */
  variant: AnalysisRowVariant
  visibleColumns: ColumnDef[]
  getWidth: (id: string) => number | undefined
  /** Resolved once by `resolveAnalysisRowActions`; omit to hide the actions column. */
  actions?: AnalysisRowActionsState
  validationData: { validation: ValidationResult; quality: QualityResult } | undefined
  onRowClick: (analysis: AlarmAnalysis) => void
  onEdit: (analysis: AlarmAnalysis) => void
  onDelete: (analysis: AlarmAnalysis) => void
  onValidationClick: (analysis: AlarmAnalysis) => void
  selection?: {
    checked: boolean
    onToggle: (id: string) => void
  }
}

export const AnalysisTableRow = memo(function AnalysisTableRow({
  analysis,
  variant,
  visibleColumns,
  getWidth,
  actions,
  validationData,
  onRowClick,
  onEdit,
  onDelete,
  onValidationClick,
  selection,
}: AnalysisTableRowProps) {
  return (
    <TableRow
      className={analysisRowClassName(variant)}
      onClick={(e) => {
        const target = e.target as HTMLElement
        if (target.closest('button') || target.closest('input[type="checkbox"]')) return
        onRowClick(analysis)
      }}
    >
      {selection && (
        <TableCell
          className="w-10 py-2.5 align-middle"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selection.checked}
            onChange={() => selection.onToggle(analysis.id)}
            aria-label="Seleziona analisi"
          />
        </TableCell>
      )}
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
      {actions && (
        <TableCell className={analysisActionsCellClassName(variant)}>
          <AnalysisRowActions
            analysis={analysis}
            canEdit={actions.canEdit}
            isLocked={actions.locked}
            canDelete={actions.canDelete}
            lockDays={actions.lockDays}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </TableCell>
      )}
    </TableRow>
  )
})
