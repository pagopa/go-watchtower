import type { AlarmEvent } from '@/lib/api-client'
import { isHighEvent } from './event-priority'

// ─── Permissions ──────────────────────────────────────────────────────────────

/**
 * What the current user may do to an alarm event. These are independent ACL
 * bits — any combination is reachable — so they travel together as one value
 * instead of being drilled through the view tree as three separate flags.
 */
export interface AlarmEventPermissions {
  write: boolean
  delete: boolean
  writeAnalysis: boolean
}

/** The actions column is rendered only when the user can do something with it. */
export function hasRowActions(permissions: AlarmEventPermissions): boolean {
  return permissions.write || permissions.delete || permissions.writeAnalysis
}

// ─── Row state ────────────────────────────────────────────────────────────────

/**
 * The single visual treatment a row gets. The underlying conditions overlap
 * (a row can be both on-call and ignored), so precedence is resolved once in
 * `resolveAlarmEventRowState` rather than re-derived at each call site.
 */
export type AlarmEventRowVariant =
  | 'checked'
  | 'detailSelected'
  | 'lingering'
  | 'onCall'
  | 'high'
  | 'ignored'
  | 'default'

/** Everything a row needs to know about its own place in the table. */
export interface AlarmEventRowState {
  /** Bulk-selection checkbox state. */
  checked: boolean
  /** Row is the one open in the detail panel (also tints the sticky actions cell). */
  detailSelected: boolean
  /** Passed through to the cell renderers, which badge on-call events. */
  onCall: boolean
  /** Passed through to the cell renderers, which dim ignored events. */
  ignored: boolean
  variant: AlarmEventRowVariant
}

/**
 * Table-wide inputs needed to place any single row: where the detail panel
 * currently points and how to classify an event. Drilled through the views as
 * one value so each of them no longer carries its own `showDetailPanel` /
 * `isOnCallEvent` / `isIgnoredEvent` trio.
 */
export interface AlarmEventRowPlacement {
  detailEventId: string | null
  showDetailPanel: boolean
  lingeringId: string | null
  isOnCallEvent?: (event: AlarmEvent) => boolean
  isIgnoredEvent?: (event: AlarmEvent) => boolean
}

export function resolveAlarmEventRowState(
  event: AlarmEvent,
  placement: AlarmEventRowPlacement,
  selectedIds: ReadonlySet<string>,
): AlarmEventRowState {
  const checked = selectedIds.has(event.id)
  const detailSelected = event.id === placement.detailEventId && placement.showDetailPanel
  const lingering = event.id === placement.lingeringId && !placement.showDetailPanel
  const onCall = placement.isOnCallEvent ? placement.isOnCallEvent(event) : false
  const ignored = placement.isIgnoredEvent ? placement.isIgnoredEvent(event) : false

  const variant: AlarmEventRowVariant = checked
    ? 'checked'
    : detailSelected
      ? 'detailSelected'
      : lingering
        ? 'lingering'
        : onCall
          ? 'onCall'
          : isHighEvent(event)
            ? 'high'
            : ignored
              ? 'ignored'
              : 'default'

  return { checked, detailSelected, onCall, ignored, variant }
}

// ─── Class names ──────────────────────────────────────────────────────────────

const ROW_VARIANT_CLASS: Record<AlarmEventRowVariant, string> = {
  checked:        'border-l-transparent bg-primary/[0.05] hover:bg-primary/[0.08]',
  detailSelected: 'border-l-transparent analysis-row-selected hover:bg-primary/[0.09]',
  lingering:      'border-l-transparent analysis-row-lingering hover:bg-muted/30',
  onCall:         'border-l-rose-500/60 bg-rose-500/[0.04] hover:bg-rose-500/[0.06] transition-colors',
  high:           'border-l-amber-500/60 bg-amber-500/[0.04] hover:bg-amber-500/[0.06] transition-colors',
  ignored:        'border-l-transparent opacity-50 transition-colors hover:opacity-70 hover:bg-muted/30',
  default:        'border-l-transparent transition-colors hover:bg-muted/30',
}

export function alarmEventRowClassName(variant: AlarmEventRowVariant): string {
  return 'group cursor-pointer border-b border-border/50 border-l-[3px] ' + ROW_VARIANT_CLASS[variant]
}

export function alarmEventActionsCellClassName(detailSelected: boolean): string {
  return (
    'relative sticky right-0 z-10 border-l border-border/40 py-2 ' +
    (detailSelected
      ? 'bg-primary/[0.07] group-hover:bg-primary/[0.09]'
      : 'bg-card group-hover:bg-muted')
  )
}
