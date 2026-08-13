import type { AlarmAnalysis } from '@/lib/api-client'

// ─── Row placement ────────────────────────────────────────────────────────────

/**
 * The single visual treatment a row gets — these conditions are exclusive.
 * `onCall` is only produced by the daily/on-call views; the list view does not
 * tint on-call rows.
 */
export type AnalysisRowVariant = 'selected' | 'lingering' | 'onCall' | 'default'

/**
 * Where the detail panel currently points. Drilled through the views as one
 * value so each of them no longer carries its own
 * `selectedAnalysisId` / `showDetailPanel` / `lingeringId` trio.
 */
export interface AnalysisRowPlacement {
  detailAnalysisId: string | null
  showDetailPanel: boolean
  lingeringId: string | null
}

export function resolveAnalysisRowVariant(
  analysis: AlarmAnalysis,
  placement: AnalysisRowPlacement,
): AnalysisRowVariant {
  if (analysis.id === placement.detailAnalysisId && placement.showDetailPanel) return 'selected'
  if (analysis.id === placement.lingeringId && !placement.showDetailPanel) return 'lingering'
  return 'default'
}

/** As above, but the daily and on-call views additionally tint on-call rows. */
export function resolveShiftAnalysisRowVariant(
  analysis: AlarmAnalysis,
  placement: AnalysisRowPlacement,
): AnalysisRowVariant {
  const variant = resolveAnalysisRowVariant(analysis, placement)
  if (variant === 'default' && analysis.isOnCall) return 'onCall'
  return variant
}

const ROW_VARIANT_CLASS: Record<AnalysisRowVariant, string> = {
  selected:  'analysis-row-selected hover:bg-primary/[0.09]',
  lingering: 'analysis-row-lingering hover:bg-muted/30',
  onCall:    'bg-rose-500/[0.04] hover:bg-rose-500/[0.06] transition-colors border-l-[3px] border-l-rose-500/60',
  default:   'transition-colors hover:bg-muted/30',
}

export function analysisRowClassName(variant: AnalysisRowVariant): string {
  return 'group cursor-pointer border-b border-border/50 ' + ROW_VARIANT_CLASS[variant]
}

export function analysisActionsCellClassName(variant: AnalysisRowVariant): string {
  return (
    'relative sticky right-0 z-10 border-l border-border/40 py-2 ' +
    (variant === 'selected'
      ? 'bg-primary/[0.07] group-hover:bg-primary/[0.09]'
      : 'bg-card group-hover:bg-muted')
  )
}

// ─── Row actions ──────────────────────────────────────────────────────────────

/**
 * What the current user may do to analyses. `canWriteAnalysis` deliberately
 * ignores the edit lock so `resolveAnalysisRowActions` can tell "you may not
 * edit this" apart from "you may, but the edit window has closed".
 */
export interface AnalysisActionPolicy {
  /** Whether the actions column is rendered at all. */
  enabled: boolean
  canWriteAnalysis: (analysis: AlarmAnalysis) => boolean
  canDeleteAnalysis: (analysis: AlarmAnalysis) => boolean
  isAnalysisLocked: (analysis: AlarmAnalysis) => boolean
  lockDays: number | null
}

/** The resolved action affordances for one row. */
export interface AnalysisRowActionsState {
  canEdit: boolean
  /** Show the "locked after N days" affordance instead of Edit. */
  locked: boolean
  canDelete: boolean
  lockDays: number | null
}

export function resolveAnalysisRowActions(
  analysis: AlarmAnalysis,
  policy: AnalysisActionPolicy,
): AnalysisRowActionsState {
  const writable = policy.canWriteAnalysis(analysis)
  const locked = policy.isAnalysisLocked(analysis)
  return {
    canEdit: writable && !locked,
    locked: writable && locked,
    canDelete: policy.canDeleteAnalysis(analysis),
    lockDays: policy.lockDays,
  }
}
