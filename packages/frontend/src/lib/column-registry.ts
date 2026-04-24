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
  alarmEvents: [
    { id: 'firedAt',      label: 'Data scatto',   locked: true,          defaultWidth: 186, minWidth: 130, sortKey: 'firedAt' },
    { id: 'tipo',         label: 'Priority',                             defaultWidth: 122, minWidth: 76 },
    { id: 'link',         label: 'Allarme',                              defaultWidth: 80,  minWidth: 44 },
    { id: 'analysis',     label: 'Analisi',                              defaultWidth: 80,  minWidth: 44 },
    { id: 'name',         label: 'Nome allarme',                         defaultWidth: 510, minWidth: 140 },
    { id: 'product',      label: 'Prodotto',                             defaultWidth: 116, minWidth: 80 },
    { id: 'environment',  label: 'Ambiente',                             defaultWidth: 110, minWidth: 80 },
    { id: 'alarm',        label: 'Allarme (testo)', defaultVisible: false, defaultWidth: 200, minWidth: 120 },
    { id: 'awsRegion',    label: 'Region AWS',    defaultVisible: false, defaultWidth: 130, minWidth: 90 },
    { id: 'awsAccountId', label: 'Account AWS',   defaultVisible: false, defaultWidth: 140, minWidth: 100 },
    { id: 'description',  label: 'Descrizione',   defaultVisible: false, defaultWidth: 220, minWidth: 120 },
    { id: 'reason',       label: 'Ragione',        defaultVisible: false, defaultWidth: 200, minWidth: 120 },
  ],
  systemEvents: [
    { id: 'quando',  label: 'Quando',     locked: true,          defaultWidth: 160, minWidth: 130, sortKey: 'createdAt' },
    { id: 'azione',  label: 'Azione',                            defaultWidth: 220, minWidth: 140 },
    { id: 'risorsa', label: 'Risorsa',                           defaultWidth: 260, minWidth: 140 },
    { id: 'utente',  label: 'Utente',                            defaultWidth: 180, minWidth: 100, sortKey: 'userLabel' },
    { id: 'ip',      label: 'IP Address', defaultVisible: false, defaultWidth: 130, minWidth: 80 },
  ],
  analyses: [
    // ── Default visible columns (in display order) ──────────────────────────
    { id: 'analysisDate',    label: 'Data analisi',    locked: true,  defaultWidth: 155, minWidth: 100, sortKey: 'analysisDate' },
    { id: 'occurrences',     label: 'Occorrenze',                     defaultWidth: 60,  minWidth: 44,  sortKey: 'occurrences' },
    { id: 'alarm',           label: 'Allarme',                        defaultWidth: 465, minWidth: 100 },
    { id: 'environment',     label: 'Ambiente',                       defaultWidth: 106, minWidth: 80 },
    { id: 'status',          label: 'Stato',                          defaultWidth: 88,  minWidth: 44 },
    { id: 'analysisType',    label: 'Tipo',                           defaultWidth: 66,  minWidth: 44 },
    { id: 'operator',        label: 'Operatore',                      defaultWidth: 162, minWidth: 80 },
    { id: 'validation',      label: 'Valutazione',                    defaultWidth: 140, minWidth: 100 },
    // ── Hidden by default — manageable from the column configurator ─────────
    { id: 'product',         label: 'Prodotto',       defaultVisible: false, defaultWidth: 100, minWidth: 80 },
    { id: 'ignoreReason',    label: 'Motivazione',    defaultVisible: false, defaultWidth: 160, minWidth: 100 },
    { id: 'finalAction',     label: 'Azione Finale',  defaultVisible: false, defaultWidth: 160, minWidth: 100 },
    { id: 'runbook',         label: 'Runbook',        defaultVisible: false, defaultWidth: 160, minWidth: 100 },
    { id: 'resources',       label: 'Risorse',         defaultVisible: false, defaultWidth: 160, minWidth: 100 },
    { id: 'downstreams',     label: 'Downstream',     defaultVisible: false, defaultWidth: 160, minWidth: 100 },
    { id: 'isOnCall',        label: 'On-Call',        defaultVisible: false, defaultWidth: 80,  minWidth: 60 },
    { id: 'firstAlarmAt',    label: 'Primo allarme',  defaultVisible: false, defaultWidth: 120, minWidth: 100, sortKey: 'firstAlarmAt' },
    { id: 'lastAlarmAt',     label: 'Ultimo allarme', defaultVisible: false, defaultWidth: 120, minWidth: 100, sortKey: 'lastAlarmAt' },
    { id: 'errorDetails',    label: 'Dettagli errore',   defaultVisible: false, defaultWidth: 200, minWidth: 100 },
    { id: 'conclusionNotes', label: 'Note conclusione',  defaultVisible: false, defaultWidth: 200, minWidth: 100 },
  ],
}

export const LIST_LABELS: Record<string, string> = {
  analyses: 'Analisi allarmi',
  systemEvents: 'Log eventi',
  alarmEvents: 'Allarmi scattati',
}
