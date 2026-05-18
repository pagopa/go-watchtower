'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Pencil, Trash2, Copy, Check, BellRing, Cloud, Info, BookOpen, ExternalLink, PhoneCall, FileSearch, Unlink, OctagonAlert, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type AlarmEvent, type AlarmAnalysis, type IgnoredAlarm } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { invalidate } from '@/lib/query-invalidation'
import { sanitizeUrl } from '@/lib/sanitize-url'
import { usePreferences } from '@/hooks/use-preferences'
import { matchIgnoredAlarm } from '@go-watchtower/shared'
import { ANALYSIS_STATUS_LABELS, ANALYSIS_TYPE_LABELS } from '../../analyses/_lib/constants'
import { IgnoredAlarmDetailsDialog } from '../../analyses/_components/ignored-alarm-warning'
import { UnlinkAlarmEventDialog } from './unlink-alarm-event-dialog'

// ─── Linked analysis section ──────────────────────────────────────────────────

function LinkedAnalysisSection({ analysisId, productId, eventId, eventName }: {
  analysisId: string; productId: string; eventId: string; eventName: string
}) {
  const queryClient = useQueryClient()
  const [unlinkOpen, setUnlinkOpen] = useState(false)
  const { data: analysis, isLoading } = useQuery<AlarmAnalysis>({
    queryKey: qk.analyses.detail(productId, analysisId),
    queryFn: () => api.getAnalysis(productId, analysisId),
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SectionHeader label="Analisi collegata" icon={FileSearch} />
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    )
  }

  if (!analysis) return null

  const romeDate = ROME_FULL_FORMATTER.format(new Date(analysis.analysisDate))

  return (
    <div className="space-y-4">
      <SectionHeader label="Analisi collegata" icon={FileSearch} />
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={`/analyses?productId=${productId}&analysisId=${analysisId}`}
            className="min-w-0 flex-1 space-y-1.5 transition-opacity hover:opacity-70"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium truncate">{analysis.alarm.name}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono tabular-nums">{romeDate}</span>
              <span className="text-border">·</span>
              <span>{analysis.operator.name}</span>
              <span className="text-border">·</span>
              <span className="tabular-nums">{analysis.occurrences} occ.</span>
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {ANALYSIS_STATUS_LABELS[analysis.status]}
            </Badge>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {ANALYSIS_TYPE_LABELS[analysis.analysisType]}
            </Badge>
            <button
              type="button"
              title="Scollega dall'analisi"
              onClick={(e) => { e.stopPropagation(); setUnlinkOpen(true) }}
              className="ml-1 inline-flex items-center justify-center rounded p-1 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Unlink className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <UnlinkAlarmEventDialog
        open={unlinkOpen}
        onOpenChange={setUnlinkOpen}
        eventId={eventId}
        eventName={eventName}
        analysis={analysis}
        onCompleted={() => {
          invalidate(queryClient, 'alarmEvents')
        }}
      />
    </div>
  )
}

// ─── Main panel ──────────────────────────────────────────────────────────────

interface AlarmEventDetailPanelProps {
  event: AlarmEvent | null
  open: boolean
  onClose: () => void
  onEdit: (event: AlarmEvent) => void
  onDelete: (event: AlarmEvent) => void
  canWrite: boolean
  canDelete: boolean
  onAlarmClick?: (alarm: NonNullable<AlarmEvent['alarm']>, productId: string) => void
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label, icon: Icon }: { label: string; icon: React.ElementType }) {
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
        {label}
      </dt>
      <dd className="text-[15px] font-medium text-foreground">{children}</dd>
    </div>
  )
}

// ─── Copy button ──────────────────────────────────────────────────────────────

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

// ─── Timestamp field with UTC + Rome local time ──────────────────────────────

const UTC_FULL_FORMATTER = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'UTC',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})

const ROME_FULL_FORMATTER = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})

function UtcTimestamp({ isoStr }: { isoStr: string }) {
  const date = new Date(isoStr)

  const utcFormatted   = UTC_FULL_FORMATTER.format(date)
  const romeFormatted  = ROME_FULL_FORMATTER.format(date)

  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5">
        <span className="font-mono text-sm">{utcFormatted}</span>
        <span className="rounded bg-muted px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
          UTC
        </span>
        <CopyButton value={isoStr} title="Copia ISO 8601" />
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="font-mono text-xs text-muted-foreground/60">{romeFormatted}</span>
        <span className="rounded bg-muted px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40">
          Roma
        </span>
      </span>
    </span>
  )
}

// ─── Resize constants ─────────────────────────────────────────────────────────

const MIN_PANEL_WIDTH = 320
const MAX_PANEL_WIDTH = 1000
const DEFAULT_PANEL_WIDTH = 560

// ─── Main panel ───────────────────────────────────────────────────────────────

export function AlarmEventDetailPanel({
  event,
  open,
  onClose,
  onEdit,
  onDelete,
  canWrite,
  canDelete,
  onAlarmClick,
}: AlarmEventDetailPanelProps) {
  const { preferences, updatePreferences } = usePreferences()
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const [showIgnoredDetails, setShowIgnoredDetails] = useState(false)

  // Fetch ignored alarm rules for the event's product
  const { data: ignoredAlarms } = useQuery<IgnoredAlarm[]>({
    queryKey: qk.products.ignoredAlarms(event?.product.id ?? ''),
    queryFn: () => api.getIgnoredAlarms(event!.product.id),
    enabled: open && !!event?.alarmId,
    staleTime: 60_000,
  })

  const ignoredMatch = useMemo((): IgnoredAlarm | null => {
    if (!event?.alarmId || !ignoredAlarms || ignoredAlarms.length === 0) return null
    const match = matchIgnoredAlarm({
      alarmId: event.alarmId,
      environmentId: event.environment.id,
      firstAlarmAt: event.firedAt,
      ignoredAlarms,
    })
    if (!match) return null
    return ignoredAlarms.find((ia) => ia.id === match.id) ?? null
  }, [event?.alarmId, event?.environment.id, event?.firedAt, ignoredAlarms])

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
          <div className="h-full w-px shrink-0 bg-border transition-[width,background-color] duration-150 group-hover:w-0.5 group-hover:bg-primary/60 group-active:bg-primary" />
          <div className="pointer-events-none absolute left-0 right-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-[3px] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[3px] w-[3px] rounded-full bg-primary" />
            ))}
          </div>
        </div>

        {/* Skeleton while no event */}
        {!event && (
          <div className="flex flex-1 flex-col gap-5 p-5">
            <div className="space-y-3 border-b border-border pb-5">
              <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" style={{ animationDelay: `${i * 60}ms` }} />
              </div>
            ))}
          </div>
        )}

        {event && (
          <>
            {/* Header */}
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="min-w-0 space-y-1.5">
                <h2 className="text-base font-semibold leading-tight break-words pr-2">
                  {event.name}
                </h2>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">{event.product.name}</span>
                  <span className="mx-1.5 text-border">·</span>
                  {event.environment.name}
                </p>
                {event.priority.countsAsOnCall ? (
                  <span className="inline-flex items-center gap-1 rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    <PhoneCall className="h-2.5 w-2.5" />
                    {event.priority.label}
                  </span>
                ) : event.priority.rank > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {event.priority.label}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded border border-border/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/50">
                    {event.priority.label}
                  </span>
                )}
                {event.priority.ruleName && (
                  <p className="text-[11px] text-muted-foreground">
                    Regola: <span className="font-medium text-foreground/80">{event.priority.ruleName}</span>
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {canWrite && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(event)} title="Modifica">
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                {canDelete && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(event)} title="Elimina">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Chiudi">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              <dl className="space-y-6 p-5">

                {/* ── Allarme ───────────────────────────────────────────── */}
                <div className="space-y-4">
                  <SectionHeader label="Allarme" icon={BellRing} />

                  <Field label="Nome">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-sm break-all">{event.name}</span>
                      <CopyButton value={event.name} />
                    </div>
                  </Field>

                  <Field label="Data e ora scatto">
                    <UtcTimestamp isoStr={event.firedAt} />
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Prodotto">
                      <span className="inline-flex items-center rounded border px-2 py-0.5 text-sm font-medium text-foreground/80">
                        {event.product.name}
                      </span>
                    </Field>
                    <Field label="Ambiente">
                      <span className="text-sm">{event.environment.name}</span>
                    </Field>
                  </div>

                </div>

                {/* ── Allarme catalogato ────────────────────────────────── */}
                {event.alarm && (
                  <div className="space-y-3">
                    <SectionHeader label="Allarme catalogato" icon={BellRing} />
                    <div className="rounded-lg border border-border/50 bg-muted/20 px-3.5 py-3 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-snug break-words">{event.alarm.name}</p>
                        {onAlarmClick ? (
                          <button
                            type="button"
                            className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            onClick={() => onAlarmClick(event.alarm!, event.product.id)}
                          >
                            <BookOpen className="h-3 w-3" />
                            Dettaglio
                          </button>
                        ) : (
                          <Link
                            href={`/products/${event.product.id}?tab=alarms`}
                            className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            Vedi
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                      {event.alarm.description && (
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {event.alarm.description}
                        </p>
                      )}
                      {event.alarm.runbook && (
                        <div className="flex items-center gap-2 pt-0.5">
                          <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                          <a
                            href={sanitizeUrl(event.alarm.runbook.link)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex min-w-0 items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <span className="truncate">{event.alarm.runbook.name}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Avviso allarme ignorato ──────────────────────────── */}
                {ignoredMatch && (
                  <div className={cn(
                    'flex items-start gap-3 rounded-xl border px-4 py-3.5',
                    'border-amber-400/30 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-950/25',
                  )}>
                    <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 leading-snug">
                        Allarme da ignorare
                      </p>
                      <p className="mt-0.5 text-xs text-amber-800/70 dark:text-amber-300/70 leading-relaxed">
                        Questo allarme è configurato come &ldquo;da ignorare&rdquo; per{' '}
                        <span className="font-semibold">{ignoredMatch.environment.name}</span>.
                        {ignoredMatch.reason && (
                          <> Motivo: {ignoredMatch.reason}</>
                        )}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowIgnoredDetails(true)}
                      className={cn(
                        'shrink-0 h-7 gap-1.5 text-xs font-semibold',
                        'text-amber-700 hover:text-amber-900 hover:bg-amber-100/80',
                        'dark:text-amber-400 dark:hover:text-amber-200 dark:hover:bg-amber-900/40',
                      )}
                    >
                      Dettagli
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                {/* ── AWS ───────────────────────────────────────────────── */}
                <div className="space-y-4">
                  <SectionHeader label="AWS" icon={Cloud} />

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Region">
                      <div className="flex items-center gap-1.5">
                        <code className="font-mono text-sm text-foreground/80">{event.awsRegion}</code>
                        <CopyButton value={event.awsRegion} />
                      </div>
                    </Field>
                    <Field label="Account ID">
                      <div className="flex items-center gap-1.5">
                        <code className="font-mono text-sm text-foreground/80">{event.awsAccountId}</code>
                        <CopyButton value={event.awsAccountId} />
                      </div>
                    </Field>
                  </div>
                </div>

                {/* ── Dettagli ──────────────────────────────────────────── */}
                {(event.description || event.reason) && (
                  <div className="space-y-4">
                    <SectionHeader label="Dettagli" icon={Info} />

                    {event.description && (
                      <Field label="Descrizione">
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                          {event.description}
                        </p>
                      </Field>
                    )}

                    {event.reason && (
                      <Field label="Ragione">
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                          {event.reason}
                        </p>
                      </Field>
                    )}
                  </div>
                )}

                {/* ── Analisi collegata ───────────────────────────────── */}
                {event.analysisId && (
                  <LinkedAnalysisSection
                    analysisId={event.analysisId}
                    productId={event.product.id}
                    eventId={event.id}
                    eventName={event.name}
                  />
                )}

                {/* ── Metadata ──────────────────────────────────────────── */}
                <div className="rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
                  <p className="text-xs text-muted-foreground/60">
                    <span className="font-semibold uppercase tracking-wide">Registrato</span>
                    {' · '}
                    <UtcTimestamp isoStr={event.createdAt} />
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground/40 break-all">
                    ID: {event.id}
                  </p>
                </div>

              </dl>
            </div>
          </>
        )}
      </div>

      {ignoredMatch && (
        <IgnoredAlarmDetailsDialog
          ignoredAlarm={ignoredMatch}
          open={showIgnoredDetails}
          onOpenChange={setShowIgnoredDetails}
        />
      )}
    </>
  )
}
