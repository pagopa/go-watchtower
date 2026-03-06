'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  X, Pencil, Trash2, ExternalLink, Copy, Check, Unlink,
  Bell, FileText, ListChecks, Info, ShieldCheck, Zap,
  XCircle, AlertCircle, CheckCircle, Circle, ChevronDown, Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAnalysisScores } from '@/hooks/use-analysis-scores'
import { api, type AlarmAnalysis, type AlarmEvent, type PaginatedResponse } from '@/lib/api-client'
import { sanitizeUrl } from '@/lib/sanitize-url'
import { usePreferences } from '@/hooks/use-preferences'
import { UnlinkAlarmEventDialog } from '../../alarm-events/_components/unlink-alarm-event-dialog'
import {
  ANALYSIS_TYPE_LABELS,
  ANALYSIS_STATUS_LABELS,
  ANALYSIS_STATUS_VARIANTS,
  formatDateTimeRome,
  formatDateTimeUTC,
  formatDateTimeDual,
  computeMTTA,
} from '../_lib/constants'

// ─── Linked alarm events sub-section ──────────────────────────────────────────

function LinkedAlarmEvents({ analysis }: { analysis: AlarmAnalysis }) {
  const queryClient = useQueryClient()
  const [unlinkEvent, setUnlinkEvent] = useState<AlarmEvent | null>(null)

  const { data } = useQuery<PaginatedResponse<AlarmEvent>>({
    queryKey: ['alarm-events', { analysisId: analysis.id }],
    queryFn: () => api.getAlarmEvents({ analysisId: analysis.id, pageSize: 100 }),
    staleTime: 30_000,
  })

  const events = data?.data ?? []
  if (events.length === 0) return null

  return (
    <section className="space-y-4">
      <SectionHeader label="Alarm Events collegati" icon={Zap} />
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Data scatto</th>
              <th className="px-3 py-2 text-left font-medium">Nome</th>
              <th className="px-3 py-2 text-left font-medium">Ambiente</th>
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="group border-b border-border/50 last:border-0">
                <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground">
                  {formatDateTimeUTC(event.firedAt)}
                </td>
                <td className="px-3 py-2 truncate max-w-[200px]">{event.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{event.environment.name}</td>
                <td className="px-1 py-1">
                  <button
                    type="button"
                    title="Scollega"
                    onClick={() => setUnlinkEvent(event)}
                    className="inline-flex items-center justify-center rounded p-1 text-muted-foreground/30 opacity-0 transition-all group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <UnlinkAlarmEventDialog
        open={!!unlinkEvent}
        onOpenChange={(open) => { if (!open) setUnlinkEvent(null) }}
        eventId={unlinkEvent?.id ?? null}
        eventName={unlinkEvent?.name ?? ''}
        analysis={analysis}
        onCompleted={() => {
          queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith('alarm-events') })
          queryClient.invalidateQueries({ queryKey: ['analyses'] })
          setUnlinkEvent(null)
        }}
      />
    </section>
  )
}

// ─── Main panel ──────────────────────────────────────────────────────────────

interface AnalysisDetailPanelProps {
  analysis: AlarmAnalysis | null
  open: boolean
  onClose: () => void
  onEdit: (analysis: AlarmAnalysis) => void
  onDelete: (analysis: AlarmAnalysis) => void
  canWrite: boolean
  canDelete: boolean
  isLocked?: boolean
  lockDays?: number | null
}

// ─── Section header with icon ─────────────────────────────────────────────────

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

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
        {label}
      </dt>
      <dd className="text-[15px] font-medium text-foreground">{children}</dd>
    </div>
  )
}

// ─── Simple copy button ───────────────────────────────────────────────────────

function CopyButton({ value, title = 'Copia' }: { value: string; title?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={title}
      className="inline-flex items-center justify-center rounded p-1 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-muted-foreground"
    >
      {copied
        ? <Check className="h-3.5 w-3.5 text-green-500" />
        : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

// ─── Date copy button with format picker ──────────────────────────────────────

function DateCopyButton({ isoStr, formatted }: { isoStr: string; formatted: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<'iso' | 'std' | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const copy = (value: string, key: 'iso' | 'std') => {
    navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => { setCopied(null); setOpen(false) }, 1200)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Copia data"
        className="inline-flex items-center justify-center rounded p-1 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-muted-foreground"
      >
        {copied
          ? <Check className="h-3 w-3 text-green-500" />
          : <Copy className="h-3 w-3" />}
      </button>

      {open && (
        <div className="absolute left-full top-1/2 z-50 ml-1.5 min-w-[192px] -translate-y-1/2 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <button
            type="button"
            onClick={() => copy(isoStr, 'iso')}
            className="flex w-full flex-col px-3 py-2.5 text-left transition-colors hover:bg-muted"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">ISO 8601</span>
            <span className="mt-0.5 font-mono text-xs text-foreground/80 truncate">{isoStr}</span>
          </button>
          <div className="h-px bg-border" />
          <button
            type="button"
            onClick={() => copy(formatted, 'std')}
            className="flex w-full flex-col px-3 py-2.5 text-left transition-colors hover:bg-muted"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Standard</span>
            <span className="mt-0.5 font-mono text-xs text-foreground/80">{formatted}</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Analysis date: Roma (primary) + UTC (secondary) ─────────────────────────
// analysisDate is entered by the analyst in Rome local time → Roma is canonical.

function AnalysisDateField({ isoStr }: { isoStr: string }) {
  const rome = formatDateTimeRome(isoStr)
  const utc = formatDateTimeUTC(isoStr)
  const weekday = new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    timeZone: 'Europe/Rome',
  }).format(new Date(isoStr))

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-sm">{rome}</span>
        <span className="rounded bg-muted px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
          Roma
        </span>
        <DateCopyButton isoStr={isoStr} formatted={rome} />
        <span className="text-xs text-muted-foreground/50 capitalize">{weekday}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-sm text-muted-foreground">{utc}</span>
        <span className="rounded bg-muted px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
          UTC
        </span>
        <DateCopyButton isoStr={isoStr} formatted={utc} />
      </div>
    </div>
  )
}

// ─── Alarm timestamp: UTC (primary) + Roma (secondary) ───────────────────────
// firstAlarmAt/lastAlarmAt come from monitoring systems — UTC is canonical.

function AlarmTimestamp({ isoStr }: { isoStr: string }) {
  const { utc, rome } = formatDateTimeDual(isoStr)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-sm">{utc}</span>
        <span className="rounded bg-muted px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
          UTC
        </span>
        <DateCopyButton isoStr={isoStr} formatted={utc} />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-sm text-muted-foreground">{rome}</span>
        <span className="rounded bg-muted px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
          Roma
        </span>
        <DateCopyButton isoStr={isoStr} formatted={rome} />
      </div>
    </div>
  )
}

// ─── Tracking entry card ──────────────────────────────────────────────────────

function TrackingEntryCard({
  entry,
}: {
  entry: { traceId: string; errorCode?: string; errorDetail?: string; timestamp?: string }
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(entry.traceId)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-2 overflow-hidden rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs font-mono">
          {entry.traceId}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Copia ID"
        >
          {copied
            ? <Check className="h-3.5 w-3.5 text-green-500" />
            : <Copy className="h-3.5 w-3.5" />}
        </button>
        {entry.errorCode && (
          <Badge variant="destructive" className="shrink-0 text-xs">
            {entry.errorCode}
          </Badge>
        )}
      </div>
      {entry.timestamp && (
        <p className="font-mono text-xs text-muted-foreground">
          {new Date(entry.timestamp).toLocaleString('it-IT')}
        </p>
      )}
      {entry.errorDetail && (
        <p className="break-all whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {entry.errorDetail}
        </p>
      )}
    </div>
  )
}

// ─── Resize constants ─────────────────────────────────────────────────────────

const MIN_PANEL_WIDTH = 320
const MAX_PANEL_WIDTH = 1200
const DEFAULT_PANEL_WIDTH = 640

// ─── Main panel ───────────────────────────────────────────────────────────────

export function AnalysisDetailPanel({
  analysis,
  open,
  onClose,
  onEdit,
  onDelete,
  canWrite,
  canDelete,
  isLocked = false,
  lockDays,
}: AnalysisDetailPanelProps) {
  const { validation, quality } = useAnalysisScores(analysis)
  const [validationExpanded, setValidationExpanded] = useState(false)
  const { preferences, updatePreferences } = usePreferences()
  const [dragWidth, setDragWidth] = useState<number | null>(null)

  const panelWidth = dragWidth ?? preferences.detailPanelWidth ?? DEFAULT_PANEL_WIDTH

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = dragWidth ?? (preferences.detailPanelWidth ?? DEFAULT_PANEL_WIDTH)

    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.min(
        Math.max(startWidth - (ev.clientX - startX), MIN_PANEL_WIDTH),
        MAX_PANEL_WIDTH
      )
      setDragWidth(newWidth)
    }

    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''

      const finalWidth = Math.min(
        Math.max(startWidth - (ev.clientX - startX), MIN_PANEL_WIDTH),
        MAX_PANEL_WIDTH
      )
      if (Math.abs(ev.clientX - startX) > 2) {
        setDragWidth(null)
        updatePreferences({ detailPanelWidth: finalWidth })
      } else {
        setDragWidth(null)
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  }, [dragWidth, preferences.detailPanelWidth, updatePreferences])

  // Bug fix: never unmount the panel shell — if we return null when analysis is
  // null, the panel div gets destroyed and re-created with open=true already
  // applied, so the CSS transition never plays (no translate-x-full → translate-x-0).
  // Instead we always render the shell and show a skeleton while loading.
  const hasDettagliAnalisi = !!(
    analysis?.ignoreReason ||
    analysis?.errorDetails ||
    (analysis?.trackingIds?.length ?? 0) > 0 ||
    (analysis?.microservices.length ?? 0) > 0 ||
    (analysis?.downstreams.length ?? 0) > 0 ||
    (analysis?.links?.length ?? 0) > 0
  )

  const hasConclusioni = !!(
    analysis?.runbook?.name ||
    analysis?.runbook?.link ||
    (analysis?.finalActions.length ?? 0) > 0 ||
    analysis?.conclusionNotes
  )

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
          'fixed right-0 top-0 z-50 flex h-full flex-col bg-background shadow-2xl transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ width: `min(${panelWidth}px, 90vw)` }}
      >
        {/* Resize handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Ridimensiona pannello"
          onMouseDown={handleResizeMouseDown}
          className="group absolute left-0 top-0 z-10 flex h-full w-3 cursor-ew-resize items-center"
        >
          {/* Border line — 1px resting, 2px on hover */}
          <div className="h-full w-px shrink-0 bg-border transition-[width,background-color] duration-150 group-hover:w-0.5 group-hover:bg-primary/60 group-active:bg-primary" />
          {/* Grip dots */}
          <div className="pointer-events-none absolute left-0 right-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-[3px] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <div className="h-[3px] w-[3px] rounded-full bg-primary" />
            <div className="h-[3px] w-[3px] rounded-full bg-primary" />
            <div className="h-[3px] w-[3px] rounded-full bg-primary" />
            <div className="h-[3px] w-[3px] rounded-full bg-primary" />
            <div className="h-[3px] w-[3px] rounded-full bg-primary" />
            <div className="h-[3px] w-[3px] rounded-full bg-primary" />
          </div>
        </div>

        {!analysis && (
          <div className="flex flex-1 flex-col gap-5 p-5">
            {/* Skeleton header */}
            <div className="space-y-3 border-b border-border pb-5">
              <div className="flex gap-2">
                <div className="h-5 w-16 animate-pulse rounded-md bg-muted" />
                <div className="h-5 w-20 animate-pulse rounded-md bg-muted" />
              </div>
              <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
            </div>
            {/* Skeleton rows */}
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" style={{ animationDelay: `${i * 60}ms` }} />
              </div>
            ))}
          </div>
        )}

        {analysis && (
        <>

        {/* Header */}
        <div className="shrink-0 border-b border-border bg-muted/20 px-5 pb-4 pt-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {/* Status chips */}
              <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                <Badge variant={ANALYSIS_STATUS_VARIANTS[analysis.status]} className="text-xs">
                  {ANALYSIS_STATUS_LABELS[analysis.status]}
                </Badge>
                <Badge
                  variant={analysis.analysisType === 'ANALYZABLE' ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {ANALYSIS_TYPE_LABELS[analysis.analysisType]}
                </Badge>
                {analysis.isOnCall && (
                  <span className="inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    Reperibilità
                  </span>
                )}
              </div>
              {/* Alarm name */}
              <div className="flex items-center gap-1.5">
                <h2 className="text-lg font-semibold leading-snug">{analysis.alarm.name}</h2>
                <CopyButton value={analysis.alarm.name} title="Copia nome allarme" />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {analysis.product.name}
                <span className="mx-1.5 text-muted-foreground/30">·</span>
                {analysis.environment.name}
                <span className="mx-1.5 text-muted-foreground/30">·</span>
                {formatDateTimeRome(analysis.analysisDate)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {canWrite && (
                isLocked ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md opacity-40 cursor-not-allowed">
                          <Lock className="h-3.5 w-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {lockDays != null
                          ? `Modifica bloccata dopo ${lockDays} giorni dalla creazione`
                          : 'Modifica bloccata'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(analysis)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )
              )}
              {canDelete && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(analysis)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-7 p-5 pb-12">

            {/* ── Sezione 0: Valutazione ── */}
            {validation && quality && (
              <section className="space-y-3">
                <SectionHeader label="Valutazione" icon={ShieldCheck} />

                {/* Score row */}
                <div className="flex items-stretch gap-3">
                  {/* Validity */}
                  <div className="flex flex-1 flex-col gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'text-xl font-bold tabular-nums',
                          validation.score >= 90
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : validation.score >= 60
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {Math.round(validation.score)}%
                      </span>
                      <span className="text-xs text-muted-foreground">Integrità</span>
                      {validation.issues.length > 0 && (
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/60">
                          {validation.errors.length > 0 && (
                            <span className="text-red-500">{validation.errors.length} err</span>
                          )}
                          {validation.errors.length > 0 && validation.warnings.length > 0 && (
                            <span className="mx-1 text-muted-foreground/40">/</span>
                          )}
                          {validation.warnings.length > 0 && (
                            <span className="text-amber-500">{validation.warnings.length} warn</span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-border/60">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          validation.score >= 90 ? 'bg-emerald-500'
                            : validation.score >= 60 ? 'bg-amber-500'
                              : 'bg-red-500'
                        )}
                        style={{ width: `${Math.min(100, Math.round(validation.score))}%` }}
                      />
                    </div>
                  </div>

                  {/* Quality */}
                  <div className="flex flex-1 flex-col gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'text-xl font-bold tabular-nums',
                          quality.score >= 7
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : quality.score >= 6
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {quality.score}/10
                      </span>
                      <span className="text-xs text-muted-foreground">Qualità</span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/60">
                        {quality.satisfiedCount}/{quality.totalApplicable} criteri
                      </span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-border/60">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          quality.score >= 7 ? 'bg-emerald-500'
                            : quality.score >= 6 ? 'bg-amber-500'
                              : 'bg-red-500'
                        )}
                        style={{ width: `${Math.round((quality.score / 10) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Expand toggle */}
                <button
                  type="button"
                  onClick={() => setValidationExpanded((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform duration-200',
                      validationExpanded && 'rotate-180'
                    )}
                  />
                  {validationExpanded ? 'Nascondi dettaglio' : 'Mostra dettaglio valutazione'}
                </button>

                {/* Inline expanded validation detail */}
                {validationExpanded && (
                  <div className="space-y-4 rounded-lg border border-border/60 bg-muted/10 p-4">

                    {/* Problems */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                        Problemi
                      </p>
                      {validation.issues.length === 0 ? (
                        <div className="flex items-center gap-2.5 rounded-md border border-emerald-200 bg-emerald-500/5 px-3 py-2 dark:border-emerald-500/20">
                          <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            Nessun problema rilevato
                          </span>
                        </div>
                      ) : (
                        <>
                          {validation.errors.map((issue) => (
                            <div
                              key={issue.ruleId}
                              className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-500/5 px-3 py-2 dark:border-red-500/20"
                            >
                              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                              <span className="text-xs text-foreground">{issue.message}</span>
                            </div>
                          ))}
                          {validation.warnings.map((issue) => (
                            <div
                              key={issue.ruleId}
                              className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-500/5 px-3 py-2 dark:border-amber-500/20"
                            >
                              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                              <span className="text-xs text-foreground">{issue.message}</span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>

                    {/* Quality criteria */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                        Qualità documentazione
                      </p>
                      {quality.satisfied.map((s) => (
                        <div key={s.ruleId} className="flex items-center gap-2 px-1 py-0.5">
                          <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                          <span className="text-xs text-foreground">{s.label}</span>
                        </div>
                      ))}
                      {quality.improvements.map((imp) => (
                        <div key={imp.ruleId} className="flex items-start gap-2 px-1 py-0.5">
                          <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/30" />
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">{imp.label}</p>
                            {imp.hint && (
                              <p className="text-[11px] text-muted-foreground/50">{imp.hint}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>
                )}
              </section>
            )}

            {/* ── Sezione 1: Informazioni Allarme ── */}
            <section className="space-y-4">
              <SectionHeader label="Informazioni Allarme" icon={Bell} />
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Prodotto">{analysis.product.name}</Field>
                <Field label="Data analisi">
                  <AnalysisDateField isoStr={analysis.analysisDate} />
                </Field>
                <Field label="Operatore">{analysis.operator.name}</Field>
                <Field label="Allarme">{analysis.alarm.name}</Field>
                <Field label="Reperibilità">
                  <Badge variant={analysis.isOnCall ? 'default' : 'outline'} className="text-xs">
                    {analysis.isOnCall ? 'Sì' : 'No'}
                  </Badge>
                </Field>
                <Field label="Occorrenze">
                  <span className="tabular-nums">{analysis.occurrences}</span>
                </Field>
                <Field label="Ambiente">{analysis.environment.name}</Field>
                <Field label="MTTA">
                  <span className="tabular-nums font-medium">
                    {computeMTTA(analysis.analysisDate, analysis.firstAlarmAt)}
                  </span>
                </Field>
                <Field label="Primo allarme">
                  <AlarmTimestamp isoStr={analysis.firstAlarmAt} />
                </Field>
                <Field label="Ultimo allarme">
                  <AlarmTimestamp isoStr={analysis.lastAlarmAt} />
                </Field>
              </dl>
            </section>

            {/* ── Sezione 2: Dettagli Analisi (nascosta se vuota) ── */}
            {hasDettagliAnalisi && (
              <section className="space-y-4">
                <SectionHeader label="Dettagli Analisi" icon={FileText} />

                {analysis.ignoreReason && (
                  <dl className="space-y-3">
                    <Field label="Motivo">{analysis.ignoreReason.label}</Field>
                    {analysis.ignoreReason.detailsSchema?.properties &&
                      analysis.ignoreDetails &&
                      Object.entries(analysis.ignoreReason.detailsSchema.properties).map(([key, def]) => {
                        const value = analysis.ignoreDetails?.[key]
                        if (!value) return null
                        return (
                          <Field key={key} label={def.title}>
                            {String(value)}
                          </Field>
                        )
                      })}
                  </dl>
                )}

                {analysis.errorDetails && (
                  <div>
                    <dt className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
                      Dettagli errore
                    </dt>
                    <dd className="rounded-lg border border-border bg-muted/40 px-3.5 py-3 font-mono text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap">
                      {analysis.errorDetails}
                    </dd>
                  </div>
                )}

                {(analysis.trackingIds?.length ?? 0) > 0 && (
                  <div>
                    <dt className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
                      ID di Tracciamento
                    </dt>
                    <dd className="space-y-2">
                      {analysis.trackingIds!.map((entry) => (
                        <TrackingEntryCard key={entry.traceId} entry={entry} />
                      ))}
                    </dd>
                  </div>
                )}

                {analysis.microservices.length > 0 && (
                  <div>
                    <dt className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
                      Microservizi
                    </dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {analysis.microservices.map((ms) => (
                        <span
                          key={ms.id}
                          className="inline-flex items-center rounded-md border border-border bg-muted/50 px-2.5 py-1 text-sm font-medium"
                        >
                          {ms.name}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}

                {analysis.downstreams.length > 0 && (
                  <div>
                    <dt className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
                      Downstream
                    </dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {analysis.downstreams.map((ds) => (
                        <span
                          key={ds.id}
                          className="inline-flex items-center rounded-md border border-border bg-muted/50 px-2.5 py-1 text-sm font-medium"
                        >
                          {ds.name}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}

                {(analysis.links?.length ?? 0) > 0 && (
                  <div>
                    <dt className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
                      Link
                    </dt>
                    <dd className="space-y-1.5">
                      {analysis.links!.map((link) => (
                        <a
                          key={link.url}
                          href={sanitizeUrl(link.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm transition-colors hover:border-primary/25 hover:bg-muted/60"
                        >
                          <span className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                            {link.type || 'Link'}
                          </span>
                          <span className="flex-1 truncate font-medium transition-colors group-hover:text-primary">
                            {link.name || link.url}
                          </span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
                        </a>
                      ))}
                    </dd>
                  </div>
                )}
              </section>
            )}

            {/* ── Sezione 3: Conclusioni e azioni finali (nascosta se vuota) ── */}
            {hasConclusioni && (
              <section className="space-y-4">
                <SectionHeader label="Conclusioni e azioni finali" icon={ListChecks} />

                {(analysis.runbook?.name || analysis.runbook?.link) && (
                  <div>
                    <dt className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
                      Runbook
                    </dt>
                    <dd>
                      {analysis.runbook?.link ? (
                        <a
                          href={sanitizeUrl(analysis.runbook.link)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group inline-flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary/25 hover:bg-muted/60 hover:text-primary"
                        >
                          {analysis.runbook.name}
                          {analysis.runbook.status === 'DRAFT' && (
                            <Badge variant="secondary" className="text-xs">Bozza</Badge>
                          )}
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40 transition-colors group-hover:text-primary" />
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-[15px] font-medium">
                          {analysis.runbook?.name}
                          {analysis.runbook?.status === 'DRAFT' && (
                            <Badge variant="secondary" className="text-xs">Bozza</Badge>
                          )}
                        </span>
                      )}
                    </dd>
                  </div>
                )}

                {analysis.finalActions.length > 0 && (
                  <div>
                    <dt className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
                      Azioni Finali
                    </dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {analysis.finalActions.map((fa) => (
                        <span
                          key={fa.id}
                          className="inline-flex items-center rounded-md border border-border bg-muted/50 px-2.5 py-1 text-sm font-medium"
                        >
                          {fa.name}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}

                {analysis.conclusionNotes && (
                  <div>
                    <dt className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
                      Note conclusione
                    </dt>
                    <dd className="rounded-lg border border-border bg-muted/30 px-3.5 py-3 text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
                      {analysis.conclusionNotes}
                    </dd>
                  </div>
                )}
              </section>
            )}

            {/* ── Sezione 4: Alarm Events collegati ── */}
            <LinkedAlarmEvents analysis={analysis} />

            {/* ── Sezione 5: Metadati ── */}
            <section className="space-y-4">
              <SectionHeader label="Metadati" icon={Info} />
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Creato da">{analysis.createdBy.name}</Field>
                <Field label="Data creazione">
                  <span className="font-mono text-sm">{formatDateTimeRome(analysis.createdAt)}</span>
                </Field>
                {analysis.updatedBy && (
                  <>
                    <Field label="Aggiornato da">{analysis.updatedBy.name}</Field>
                    <Field label="Ultimo aggiornamento">
                      <span className="font-mono text-sm">{formatDateTimeRome(analysis.updatedAt)}</span>
                    </Field>
                  </>
                )}
              </dl>
            </section>

          </div>
        </div>

        </>
        )}

      </div>
    </>
  )
}
