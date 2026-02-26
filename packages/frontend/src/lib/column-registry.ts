/**
 * Column registry — single source of truth for column definitions across lists.
 *
 * This module is imported by both the list page (for runtime behaviour) and
 * the profile page (to resolve defaults when displaying column overrides).
 * Keep it free of React/Next.js imports so it can run in any context.
 */

export interface ColumnDef {
  id: string
  label: string
  /** Column cannot be hidden by the user */
  locked?: boolean
  /** Whether the column is visible by default (undefined = true) */
  defaultVisible?: boolean
  /** Default column width in pixels */
  defaultWidth?: number
  /** Minimum column width in pixels */
  minWidth?: number
  /** Backend field to sort by */
  sortKey?: string
}

export const COLUMN_REGISTRY: Record<string, ColumnDef[]> = {
  analyses: [
    { id: 'analysisDate',    label: 'Data analisi',     locked: true, defaultWidth: 120, minWidth: 100, sortKey: 'analysisDate' },
    { id: 'product',         label: 'Prodotto',                        defaultWidth: 120, minWidth: 80 },
    { id: 'alarm',           label: 'Allarme',                         defaultWidth: 200, minWidth: 100 },
    { id: 'environment',     label: 'Ambiente',                        defaultWidth: 120, minWidth: 80 },
    { id: 'analysisType',    label: 'Tipo',                            defaultWidth: 52,  minWidth: 44 },
    { id: 'status',          label: 'Stato',                           defaultWidth: 52,  minWidth: 44 },
    { id: 'operator',        label: 'Operatore',                       defaultWidth: 130, minWidth: 80 },
    { id: 'finalAction',     label: 'Azione Finale',                   defaultWidth: 160, minWidth: 100 },
    { id: 'isOnCall',        label: 'On-Call',                         defaultWidth: 80,  minWidth: 60 },
    { id: 'occurrences',     label: 'Occorrenze',                      defaultWidth: 100, minWidth: 80,  sortKey: 'occurrences' },
    { id: 'firstAlarmAt',    label: 'Primo allarme',  defaultVisible: false, defaultWidth: 120, minWidth: 100, sortKey: 'firstAlarmAt' },
    { id: 'lastAlarmAt',     label: 'Ultimo allarme', defaultVisible: false, defaultWidth: 120, minWidth: 100, sortKey: 'lastAlarmAt' },
    { id: 'errorDetails',    label: 'Dettagli errore',   defaultVisible: false, defaultWidth: 200, minWidth: 100 },
    { id: 'conclusionNotes', label: 'Note conclusione',  defaultVisible: false, defaultWidth: 200, minWidth: 100 },
    { id: 'validation',      label: 'Valutazione',                     defaultWidth: 140, minWidth: 100 },
  ],
}

export const LIST_LABELS: Record<string, string> = {
  analyses: 'Analisi allarmi',
}
