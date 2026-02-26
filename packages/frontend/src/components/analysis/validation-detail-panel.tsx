'use client'

import {
  X, AlertTriangle, AlertCircle, XCircle,
  CheckCircle, Circle, ShieldCheck, Star,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAnalysisScores } from '@/hooks/use-analysis-scores'
import type { AlarmAnalysis } from '@/lib/api-client'

interface ValidationDetailPanelProps {
  analysis: AlarmAnalysis | null
  open: boolean
  onClose: () => void
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  label,
  icon: Icon,
}: {
  label: string
  icon: React.ElementType
}) {
  return (
    <div className="flex items-center gap-2.5 pb-1">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
        {label}
      </span>
      <span className="h-px flex-1 bg-border/60" />
    </div>
  )
}

// ─── Score card with progress bar ─────────────────────────────────────────────

function ScoreCard({
  label,
  value,
  colorClass,
  progressPct,
  subtitle,
}: {
  label: string
  value: string
  colorClass: string
  progressPct: number
  subtitle?: string
}) {
  const barColor =
    progressPct >= 90 ? 'bg-emerald-500'
      : progressPct >= 60 ? 'bg-amber-500'
        : 'bg-red-500'

  return (
    <div className="flex flex-1 flex-col gap-3 rounded-xl border border-border bg-muted/30 px-4 py-4">
      <div className="flex items-end justify-between">
        <span className={cn('text-3xl font-bold tabular-nums leading-none', colorClass)}>
          {value}
        </span>
        {subtitle && (
          <span className="text-[11px] text-muted-foreground/60 tabular-nums">{subtitle}</span>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/60">
          <div
            className={cn('h-full rounded-full transition-all duration-700', barColor)}
            style={{ width: `${Math.min(100, progressPct)}%` }}
          />
        </div>
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          {label}
        </span>
      </div>
    </div>
  )
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function validityColorClass(score: number): string {
  if (score >= 90) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 60) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function qualityColorClass(score: number): string {
  if (score >= 7) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 6) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function ValidationDetailPanel({
  analysis,
  open,
  onClose,
}: ValidationDetailPanelProps) {
  const { validation, quality } = useAnalysisScores(analysis)

  if (!analysis) return null

  return (
    <>
      {/* Backdrop */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Chiudi pannello"
        className={cn(
          'fixed inset-0 z-40 bg-black/50 transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClose() }}
      />

      {/* Panel */}
      <div
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-border bg-background shadow-2xl transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-border bg-muted/20 px-5 pb-4 pt-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold leading-snug">Valutazione analisi</h2>
              </div>
              <p className="text-sm text-muted-foreground truncate">{analysis.alarm.name}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-7 p-5 pb-12">

            {/* ── Score summary row ── */}
            {validation && quality && (
              <div className="flex gap-3">
                <ScoreCard
                  label="Integrità"
                  value={`${Math.round(validation.score)}%`}
                  colorClass={validityColorClass(validation.score)}
                  progressPct={Math.round(validation.score)}
                  subtitle={
                    validation.issues.length > 0
                      ? `${validation.errors.length}e ${validation.warnings.length}w`
                      : undefined
                  }
                />
                <ScoreCard
                  label="Qualità"
                  value={`${quality.score}/10`}
                  colorClass={qualityColorClass(quality.score)}
                  progressPct={Math.round((quality.score / 10) * 100)}
                  subtitle={`${quality.satisfiedCount}/${quality.totalApplicable} criteri`}
                />
              </div>
            )}

            {/* ── Sezione Problemi ── */}
            {validation && validation.issues.length > 0 && (
              <section className="space-y-4">
                <SectionHeader label="Problemi" icon={AlertTriangle} />
                <div className="space-y-2">
                  {validation.errors.map((issue) => (
                    <div
                      key={issue.ruleId}
                      className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-500/5 px-3 py-2.5 dark:border-red-500/20"
                    >
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      <span className="text-sm text-foreground">{issue.message}</span>
                    </div>
                  ))}
                  {validation.warnings.map((issue) => (
                    <div
                      key={issue.ruleId}
                      className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-500/5 px-3 py-2.5 dark:border-amber-500/20"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <span className="text-sm text-foreground">{issue.message}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Empty state for problems ── */}
            {validation && validation.issues.length === 0 && (
              <section className="space-y-4">
                <SectionHeader label="Problemi" icon={AlertTriangle} />
                <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-500/5 px-3 py-3 dark:border-emerald-500/20">
                  <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    Nessun problema rilevato
                  </span>
                </div>
              </section>
            )}

            {/* ── Sezione Qualità ── */}
            {quality && (
              <section className="space-y-4">
                <SectionHeader label="Qualità documentazione" icon={Star} />

                <div className="space-y-1.5">
                  {quality.satisfied.map((s) => (
                    <div key={s.ruleId} className="flex items-center gap-2.5 px-1 py-1">
                      <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                      <span className="text-sm text-foreground">{s.label}</span>
                    </div>
                  ))}
                  {quality.improvements.map((imp) => (
                    <div key={imp.ruleId} className="flex items-start gap-2.5 px-1 py-1">
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
                      <div className="min-w-0">
                        <span className="text-sm text-muted-foreground">{imp.label}</span>
                        <p className="mt-0.5 text-xs text-muted-foreground/60">{imp.hint}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

          </div>
        </div>
      </div>
    </>
  )
}
