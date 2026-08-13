'use client'

/**
 * Building blocks shared by `associate-analysis-dialog` (one event) and
 * `bulk-associate-analysis-dialog` (many events). Both dialogs pick an existing
 * analysis from the same list and show the same summary of it; only the
 * left-hand event pane, the option wording and the mutation differ.
 */

import {
  Loader2, Search, AlertCircle,
  Bell, Clock, User, Hash, Calendar, Activity, Siren,
  FileText, Tag, MousePointerClick, ChevronRight, Link2,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { AlarmAnalysis } from '@/lib/api-client'
import { ANALYSIS_STATUS_LABELS, ANALYSIS_TYPE_LABELS } from '@go-watchtower/shared'
import { STATUS_ICONS, TYPE_ICONS } from '../../analyses/_lib/icons'
import {
  ANALYSIS_STATUS_VARIANTS,
  formatDateTimeRome,
  formatDateTimeUTC,
} from '../../analyses/_lib/constants'

// ─── List item ───────────────────────────────────────────────────────────────

export function AnalysisListItem({
  analysis,
  selected,
  onSelect,
}: {
  analysis: AlarmAnalysis
  selected: boolean
  onSelect: () => void
}) {
  const { Icon: StatusIcon, className: statusClassName } = STATUS_ICONS[analysis.status]

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-all duration-150',
        selected
          ? 'bg-primary/[0.07] shadow-[inset_3px_0_0_hsl(var(--primary))]'
          : 'hover:bg-muted/60'
      )}
    >
      <StatusIcon className={cn('h-3.5 w-3.5 shrink-0', statusClassName)} />
      <div className="min-w-0 flex-1">
        <p className={cn(
          'truncate text-sm leading-tight',
          selected ? 'font-semibold' : 'font-medium text-foreground/80 group-hover:text-foreground'
        )}>
          {analysis.alarm.name}
        </p>
        <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
          {formatDateTimeRome(analysis.analysisDate)}
          <span className="mx-1 opacity-30">|</span>
          {analysis.operator.name}
          <span className="mx-1 opacity-30">|</span>
          <span className="tabular-nums">{analysis.occurrences}</span> occ.
        </p>
      </div>
      <Badge
        variant={ANALYSIS_STATUS_VARIANTS[analysis.status]}
        className={cn(
          'shrink-0 text-[9px] px-1.5 py-0 leading-relaxed transition-opacity duration-150',
          !selected && 'opacity-50 group-hover:opacity-100'
        )}
      >
        {ANALYSIS_STATUS_LABELS[analysis.status]}
      </Badge>
    </button>
  )
}

function AnalysisListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
          <Skeleton className="h-3.5 w-3.5 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Detail field ────────────────────────────────────────────────────────────

export function DetailField({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/35" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 leading-none mb-0.5 font-medium">{label}</p>
        <div className="text-sm leading-tight">{children}</div>
      </div>
    </div>
  )
}

// ─── Option toggle ───────────────────────────────────────────────────────────

export function OptionToggle({
  id,
  checked,
  onCheckedChange,
  disabled,
  title,
  description,
  children,
}: {
  id: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-start gap-3 rounded-lg border bg-background px-4 py-3 transition-all duration-150',
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : checked
            ? 'cursor-pointer border-primary/25 shadow-[inset_3px_0_0_hsl(var(--primary)/0.4)]'
            : 'cursor-pointer border-border/50 hover:border-border',
      )}
    >
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{title}</p>
        <p className="text-[12px] text-muted-foreground/60 mt-1 leading-relaxed">{description}</p>
        {children}
      </div>
    </label>
  )
}

/** Renders the before → after preview under an option toggle. */
export function OptionTransition({ from, to, mono = true }: { from: string; to: string; mono?: boolean }) {
  const cls = mono ? 'font-mono tabular-nums' : ''
  return (
    <div className="flex items-center gap-2 mt-2 text-xs">
      <span className={cn(cls, 'text-muted-foreground')}>{from}</span>
      <ChevronRight className="h-3 w-3 text-primary/50" />
      <span className={cn(cls, 'font-semibold')}>{to}</span>
    </div>
  )
}

// ─── Analysis picker pane ────────────────────────────────────────────────────

/** The "Analisi disponibili" column: header, load/error/empty states and list. */
export function AnalysisPickerPane({
  analyses,
  isLoading,
  isError,
  onRetry,
  selectedAnalysisId,
  onSelectAnalysis,
  ownOnly,
  className,
}: {
  analyses: AlarmAnalysis[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  selectedAnalysisId: string | null
  onSelectAnalysis: (id: string | null) => void
  ownOnly: boolean
  className: string
}) {
  return (
    <div className={className}>
      <div className="shrink-0 px-4 py-2.5 border-b bg-background">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Analisi disponibili
          </h3>
          {analyses.length > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground">
              {analyses.length}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading ? (
          <AnalysisListSkeleton />
        ) : isError ? (
          <div className="flex flex-col items-center gap-1.5 py-10 text-center px-4">
            <AlertCircle className="h-5 w-5 text-destructive/50" />
            <p className="text-xs text-destructive">Errore nel caricamento delle analisi</p>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={onRetry}>
              Riprova
            </Button>
          </div>
        ) : analyses.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-10 text-center px-4">
            <Search className="h-5 w-5 text-muted-foreground/25" />
            <p className="text-xs text-muted-foreground">Nessuna analisi trovata</p>
            <p className="text-[11px] text-muted-foreground/50 leading-relaxed max-w-[240px]">
              Non ci sono analisi corrispondenti a questo allarme
              {ownOnly ? ' tra quelle da te create' : ''}.
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {analyses.map((analysis) => (
              <AnalysisListItem
                key={analysis.id}
                analysis={analysis}
                selected={selectedAnalysisId === analysis.id}
                onSelect={() =>
                  onSelectAnalysis(selectedAnalysisId === analysis.id ? null : analysis.id)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Shown in the right-hand pane until an analysis is picked. */
export function NoAnalysisSelected() {
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="text-center space-y-2">
        <MousePointerClick className="mx-auto h-8 w-8 text-muted-foreground/15" />
        <p className="text-sm text-muted-foreground/35">
          Seleziona un&apos;analisi dalla lista
        </p>
      </div>
    </div>
  )
}

// ─── Selected analysis summary ───────────────────────────────────────────────

/**
 * Header, status badge, detail grid and error details of the analysis the user
 * picked. `warning` lets a caller inject a caveat (the single-event dialog uses
 * it for the alarm-name mismatch notice).
 */
export function SelectedAnalysisSummary({
  analysis,
  warning,
}: {
  analysis: AlarmAnalysis
  warning?: React.ReactNode
}) {
  const { Icon: TypeIcon, className: typeClassName } = TYPE_ICONS[analysis.analysisType]

  return (
    <div className="flex-1 px-6 py-5 space-y-4 overflow-y-auto">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="h-4.5 w-4.5 text-primary/50" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Analisi selezionata</h3>
      </div>

      <div className="flex items-start justify-between gap-3">
        <p className="text-lg font-semibold leading-snug break-words">{analysis.alarm.name}</p>
        <Badge variant={ANALYSIS_STATUS_VARIANTS[analysis.status]} className="shrink-0 text-xs px-2.5 py-0.5">
          {ANALYSIS_STATUS_LABELS[analysis.status]}
        </Badge>
      </div>

      {warning}

      <div className="grid grid-cols-3 gap-x-6 gap-y-4 pt-1">
        <DetailField icon={Siren} label="Tipo">
          <div className="flex items-center gap-1.5">
            <TypeIcon className={cn('h-3.5 w-3.5', typeClassName)} />
            <span className="text-sm">{ANALYSIS_TYPE_LABELS[analysis.analysisType]}</span>
          </div>
        </DetailField>

        <DetailField icon={User} label="Operatore">
          <span className="text-sm font-medium">{analysis.operator.name}</span>
        </DetailField>

        <DetailField icon={Calendar} label="Data analisi">
          <span className="font-mono text-sm tabular-nums">{formatDateTimeRome(analysis.analysisDate)}</span>
        </DetailField>

        <DetailField icon={Hash} label="Occorrenze">
          <span className="font-mono text-sm tabular-nums font-semibold">{analysis.occurrences}</span>
        </DetailField>

        <DetailField icon={Clock} label="Primo allarme">
          <span className="font-mono text-sm tabular-nums">{formatDateTimeUTC(analysis.firstAlarmAt)} UTC</span>
        </DetailField>

        <DetailField icon={Clock} label="Ultimo allarme">
          <span className="font-mono text-sm tabular-nums">{formatDateTimeUTC(analysis.lastAlarmAt)} UTC</span>
        </DetailField>

        <DetailField icon={Tag} label="Prodotto">
          <span className="text-sm">{analysis.product.name}</span>
        </DetailField>

        <DetailField icon={Activity} label="Ambiente">
          <span className="text-sm">{analysis.environment.name}</span>
        </DetailField>

        {analysis.isOnCall && (
          <DetailField icon={Bell} label="Reperibilità">
            <Badge variant="outline" className="text-xs px-2 py-0">On-call</Badge>
          </DetailField>
        )}
      </div>

      {analysis.errorDetails && (
        <div className="pt-3 border-t border-border/40">
          <DetailField icon={FileText} label="Dettagli errore">
            <p className="text-sm text-muted-foreground leading-relaxed break-words">
              {analysis.errorDetails.length > 300
                ? `${analysis.errorDetails.slice(0, 300)}...`
                : analysis.errorDetails}
            </p>
          </DetailField>
        </div>
      )}
    </div>
  )
}

// ─── Options footer ──────────────────────────────────────────────────────────

/** Wraps the association toggles and the Annulla / confirm buttons. */
export function AssociationOptionsFooter({
  children,
  onCancel,
  onConfirm,
  confirmLabel,
  isPending,
  confirmDisabled,
}: {
  children: React.ReactNode
  onCancel: () => void
  onConfirm: () => void
  confirmLabel: string
  isPending: boolean
  confirmDisabled: boolean
}) {
  return (
    <div className="shrink-0 border-t bg-muted/10 px-5 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-muted-foreground/40" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          Opzioni associazione
        </h3>
      </div>

      {children}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
          Annulla
        </Button>
        <Button size="sm" onClick={onConfirm} disabled={confirmDisabled || isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {confirmLabel}
        </Button>
      </div>
    </div>
  )
}
