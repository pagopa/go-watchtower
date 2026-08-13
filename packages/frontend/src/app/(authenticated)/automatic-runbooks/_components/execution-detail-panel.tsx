'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Copy, RefreshCw, Ban, Check, X, Clock, Database, AlertTriangle,
  Info, Braces, Sparkles, Layers, GitBranch, Bell, Calendar, Boxes, ServerCog,
  Bot, FileSearch, ExternalLink, ShieldAlert,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { usePreferences } from '@/hooks/use-preferences'
import { ReviewDecisionDialog } from './review-decision-dialog'
import { AnalysisApplyDiagnostics } from './analysis-apply-diagnostics'
import { api, type AutomaticRunbookExecution, type AutomationExecutionStatus, type AutomationMode } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  StatusBadge, OutcomeBadge, ReviewBadge, AttemptStatusBadge, StatusDot,
  TRIGGER_LABELS, DISPATCH_LABELS, MODE_LABELS, MODE_DESCRIPTIONS, statusLabel, STATUS_ACCENT,
} from './badges'
import { ANALYSIS_TYPE_LABELS, ANALYSIS_STATUS_LABELS } from '../../analyses/_lib/constants'

// ─── Resize (shared `detailPanelWidth` preference, come analisi/allarmi) ───────
const MIN_PANEL_WIDTH = 380
const MAX_PANEL_WIDTH = 1200
const DEFAULT_PANEL_WIDTH = 680

const TERMINAL = new Set(['SUCCEEDED', 'SKIPPED', 'FAILED', 'CANCELLED'])
const CANCELLABLE = new Set(['PENDING_DISPATCH', 'QUEUED', 'RUNNING', 'RETRY_PENDING'])

function fmt(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'medium' })
}

function copy(text: string): void {
  void navigator.clipboard.writeText(text)
  toast.success('Copiato negli appunti')
}

function CopyMono({ value, short }: { value: string; short?: boolean }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-mono text-xs text-foreground/70 transition-colors hover:text-foreground"
      onClick={(e) => { e.stopPropagation(); copy(value) }}
      title={value}
    >
      {short ? `${value.slice(0, 8)}…${value.slice(-4)}` : value}
      <Copy className="h-3 w-3 opacity-50" />
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-dashed border-border/60 pb-2">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  )
}

type ExecContext = NonNullable<AutomaticRunbookExecution['context']>

/**
 * Chi ha avviato l'esecuzione, con grafica differenziata per tipo di principal:
 * umano (avatar + accento verde), service principal (icona server + accento
 * indaco) o avvio di sistema senza utente, es. Slack Ingestor (accento neutro).
 */
function LaunchedByCard({ ctx, triggerKind }: { ctx: ExecContext; triggerKind: AutomaticRunbookExecution['triggerKind'] }) {
  const t = ctx.triggeredBy
  const isHuman = t.principalType === 'HUMAN'
  const isService = t.principalType === 'SERVICE'
  const title = isService
    ? (t.serviceId ?? t.name ?? t.label ?? 'Service principal')
    : (t.name ?? t.email ?? t.label ?? TRIGGER_LABELS[triggerKind])
  const initial = (t.name ?? t.email ?? '?').trim().charAt(0).toUpperCase()

  const theme = isHuman
    ? { ring: 'border-emerald-500/30 bg-emerald-500/[0.04]', chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', label: 'Umano' }
    : isService
      ? { ring: 'border-indigo-500/30 bg-indigo-500/[0.04]', chip: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300', label: 'Servizio' }
      : { ring: 'border-dashed border-border bg-muted/30', chip: 'bg-muted text-muted-foreground', label: 'Sistema' }

  return (
    <div className={cn('col-span-2 flex items-center gap-3 rounded-lg border p-3', theme.ring)}>
      {isHuman ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-700 dark:text-emerald-300">
          {initial}
        </div>
      ) : (
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', isService ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300' : 'bg-muted text-muted-foreground')}>
          {isService ? <ServerCog className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold" title={title}>{title}</span>
          <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', theme.chip)}>{theme.label}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {isService
            ? <span className="font-mono">{t.serviceId ? `service · ${t.serviceId}` : 'service principal'}</span>
            : !isHuman && <span>Avvio automatico di sistema</span>}
          {t.email && <span>{t.email}</span>}
          <span>via {TRIGGER_LABELS[triggerKind]}</span>
        </div>
        {t.userId && <div className="mt-1"><CopyMono value={t.userId} short /></div>}
      </div>
    </div>
  )
}

/** Analisi collegata (di partenza / che verrà aggiornata) con link al dettaglio. */
function LinkedAnalysisField({ analysis }: { analysis: ExecContext['linkedAnalysis'] }) {
  if (!analysis) return <span className="text-muted-foreground">Nessuna analisi collegata</span>
  const typeLabel = ANALYSIS_TYPE_LABELS[analysis.analysisType as keyof typeof ANALYSIS_TYPE_LABELS] ?? analysis.analysisType
  const statusText = ANALYSIS_STATUS_LABELS[analysis.status as keyof typeof ANALYSIS_STATUS_LABELS] ?? analysis.status
  return (
    <Link
      href={`/analyses?productId=${analysis.productId}&analysisId=${analysis.id}`}
      className="group inline-flex items-center gap-2 rounded-md border border-border/60 bg-card px-2.5 py-1.5 transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"
    >
      <FileSearch className="h-4 w-4 shrink-0 text-primary" />
      <span className="font-medium">{typeLabel}</span>
      <span className="text-muted-foreground">· {statusText}</span>
      <span className="text-xs text-muted-foreground">· {fmt(analysis.analysisDate)}</span>
      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  )
}

function JsonViewer({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <p className="text-sm text-muted-foreground">Nessun dato.</p>
  return (
    <pre className="max-h-[60vh] overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

/** Stepper del lifecycle: lo step attivo (non terminale) pulsa per indicare attività. */
function LifecycleStepper({ status }: { status: AutomationExecutionStatus }) {
  const idx = status === 'PENDING_DISPATCH' ? 0 : status === 'QUEUED' ? 1 : TERMINAL.has(status) ? 3 : 2
  const isTerminal = TERMINAL.has(status)
  const failed = status === 'FAILED' || status === 'CANCELLED'
  const steps = ['Dispatch', 'In coda', 'Esecuzione', isTerminal ? statusLabel(status) : 'Terminale']
  return (
    <div className="flex items-center gap-1">
      {steps.map((label, i) => {
        const done = i < idx
        const active = i === idx
        const animate = active && !isTerminal // pulsa solo se in corso
        const termRed = i === 3 && active && failed
        return (
          <div key={label} className="flex flex-1 items-center gap-1">
            <div className="flex flex-col items-center gap-1">
              <span className="relative flex h-6 w-6 items-center justify-center">
                {animate && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40" />}
                <span
                  className={cn(
                    'relative flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors',
                    termRed ? 'border-rose-500 bg-rose-500/15 text-rose-500'
                      : active ? 'border-primary bg-primary text-primary-foreground'
                      : done ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-600'
                      : 'border-border bg-muted text-muted-foreground',
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
              </span>
              <span className={cn('text-[9px] uppercase tracking-wide', active ? 'font-medium text-foreground' : 'text-muted-foreground')}>{label}</span>
            </div>
            {i < steps.length - 1 && <div className={cn('mb-4 h-px flex-1', i < idx ? 'bg-emerald-500/50' : 'bg-border')} />}
          </div>
        )
      })}
    </div>
  )
}


/** Traduce i conflitti allowlisted della review in un messaggio comprensibile. */
function explainReviewFailure(message: string): string {
  if (message.includes('REVIEW_SUPERSEDED')) {
    return 'Proposta superata: un nuovo apply ha sostituito questa versione. Ricarica e rivedi la proposta corrente.'
  }
  if (message.includes('REVIEW_ALREADY_DECIDED')) return 'Decisione già presa da un altro operatore.'
  if (message.includes('REVIEW_TARGET_CHANGED')) {
    return "L'analisi o l'evento sono cambiati nel frattempo: ricarica prima di decidere."
  }
  if (message.includes('REVIEW_NOT_APPLICABLE')) return 'Questa esecuzione non ha una proposta da confermare.'
  if (message.includes('REVIEW_NOT_TERMINAL')) return "L'esecuzione non è ancora terminata."
  if (message.includes('REVIEW_INVARIANT_VIOLATION')) {
    return 'La proposta non è più applicabile: nessuna modifica è stata salvata.'
  }
  return message
}

/** Lo stato proposto vive nel draft persistito, non in una colonna dedicata. */
function proposedStatusOf(execution: AutomaticRunbookExecution): 'IN_PROGRESS' | 'COMPLETED' | undefined {
  const draft = execution.analysisDraft as { kind?: string; proposedStatus?: string } | null | undefined
  if (draft?.kind !== 'KNOWN_CASE') return undefined
  return draft.proposedStatus === 'COMPLETED' || draft.proposedStatus === 'IN_PROGRESS' ? draft.proposedStatus : undefined
}

export function ExecutionDetailPanel({
  executionId, canWrite, globalModeOverride = null, onClose,
}: {
  executionId: string | null
  canWrite: boolean
  globalModeOverride?: AutomationMode | null
  onClose: () => void
}) {
  const open = executionId !== null
  const { preferences, updatePreferences } = usePreferences()
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const panelWidth = dragWidth ?? preferences.detailPanelWidth ?? DEFAULT_PANEL_WIDTH

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = dragWidth ?? (preferences.detailPanelWidth ?? DEFAULT_PANEL_WIDTH)
    const clamp = (w: number) => Math.min(Math.max(w, MIN_PANEL_WIDTH), MAX_PANEL_WIDTH)
    const onMove = (ev: MouseEvent) => setDragWidth(clamp(startWidth - (ev.clientX - startX)))
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      const finalWidth = clamp(startWidth - (ev.clientX - startX))
      setDragWidth(null)
      if (Math.abs(ev.clientX - startX) > 2) updatePreferences({ detailPanelWidth: finalWidth })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  }, [dragWidth, preferences.detailPanelWidth, updatePreferences])

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label="Chiudi pannello"
        className={cn('fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] transition-opacity', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClose() }}
      />
      <div
        className={cn('fixed right-0 top-0 z-50 flex h-full flex-col border-l bg-background shadow-2xl transition-transform duration-300', open ? 'translate-x-0' : 'translate-x-full')}
        style={{ width: `min(${panelWidth}px, 94vw)` }}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Ridimensiona pannello"
          onMouseDown={handleResizeMouseDown}
          className="group absolute left-0 top-0 z-10 flex h-full w-3 cursor-ew-resize items-center"
        >
          <div className="h-full w-px shrink-0 bg-border transition-[width,background-color] duration-150 group-hover:w-0.5 group-hover:bg-primary/60 group-active:bg-primary" />
          <div className="pointer-events-none absolute left-0 right-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-[3px] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <div className="h-[3px] w-[3px] rounded-full bg-primary" />
            <div className="h-[3px] w-[3px] rounded-full bg-primary" />
            <div className="h-[3px] w-[3px] rounded-full bg-primary" />
          </div>
        </div>
        {executionId && <PanelBody executionId={executionId} canWrite={canWrite} globalModeOverride={globalModeOverride} onClose={onClose} />}
      </div>
    </>
  )
}

function PanelBody({ executionId, canWrite, globalModeOverride, onClose }: { executionId: string; canWrite: boolean; globalModeOverride: AutomationMode | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [cancelReason, setCancelReason] = useState('')

  const { data: execution, isLoading } = useQuery({
    queryKey: qk.automaticExecutions.detail(executionId),
    queryFn: () => api.getAutomaticExecution(executionId),
    refetchInterval: (query) => (query.state.data?.status === 'CANCEL_REQUESTED' ? 2000 : false),
  })

  const invalidate = () => { void queryClient.invalidateQueries({ queryKey: qk.automaticExecutions.root }) }
  const cancelMutation = useMutation({
    mutationFn: (reason: string) => api.cancelAutomaticExecution(executionId, reason ? { reason } : {}),
    onSuccess: (res) => { toast.success(res.status === 'CANCELLED' ? 'Esecuzione annullata' : 'Annullamento richiesto'); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })
  const retryMutation = useMutation({
    mutationFn: () => api.retryAutomaticExecution(executionId),
    onSuccess: () => { toast.success('Rilanciata: nuova esecuzione figlia'); invalidate() },
    onError: (e: Error) => toast.error(e.message),
  })
  const [reviewDecision, setReviewDecision] = useState<'CONFIRMED' | 'REJECTED' | null>(null)
  const reviewMutation = useMutation({
    mutationFn: ({ decision, note }: { decision: 'CONFIRMED' | 'REJECTED'; note: string }) =>
      decision === 'REJECTED'
        ? api.reviewAutomaticExecution(executionId, { decision, note })
        : api.reviewAutomaticExecution(executionId, { decision, ...(note === '' ? {} : { note }) }),
    onSuccess: (res) => {
      toast.success(res.alreadyReviewed ? 'Decisione già registrata' : 'Revisione registrata')
      setReviewDecision(null)
      invalidate()
    },
    // I 409 sono allowlisted (§5.9.1): vanno spiegati, non mostrati come errori generici.
    onError: (e: Error) => toast.error(explainReviewFailure(e.message)),
  })

  if (isLoading || !execution) {
    return <div className="p-6 pl-8"><Skeleton className="h-72 w-full" /></div>
  }

  const accent = STATUS_ACCENT[execution.status]
  const canCancel = canWrite && CANCELLABLE.has(execution.status)
  const canReview = canWrite && execution.reviewStatus === 'PENDING'
  const canRetry = canWrite && execution.dispatchKind !== 'CLI'
  const ctx = execution.context

  const hasInput = execution.inputSnapshot != null
  const hasResult = execution.analysisPayload != null || execution.resultSummary != null
  const hasError = !!execution.errorCode
  const hasCancel = !!execution.cancelRequestedAt

  type TabDef = { value: string; label: string; icon: React.ElementType; show: boolean }
  const tabs: TabDef[] = [
    { value: 'summary', label: 'Riepilogo', icon: Info, show: true },
    { value: 'input', label: 'Input', icon: Braces, show: hasInput },
    { value: 'result', label: 'Risultato', icon: Sparkles, show: hasResult },
    { value: 'cloudwatch', label: 'CloudWatch', icon: Database, show: true },
    { value: 'error', label: 'Errore', icon: AlertTriangle, show: hasError },
    { value: 'cancellation', label: 'Annullamento', icon: Ban, show: hasCancel },
    { value: 'attempts', label: `Tentativi`, icon: Layers, show: true },
    { value: 'related', label: 'Correlate', icon: GitBranch, show: true },
  ]

  return (
    <>
      {/* Header */}
      <div className={cn('shrink-0 border-b border-l-4 bg-muted/30 px-6 pb-4 pl-7 pt-5', accent.bar)}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <StatusDot status={execution.status} />
            <span className="text-sm font-semibold tracking-tight">Esecuzione automatica</span>
          </div>
          <button type="button" onClick={onClose} className="rounded-sm opacity-60 transition-opacity hover:opacity-100" aria-label="Chiudi">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={execution.status} />
          <OutcomeBadge outcome={execution.outcome} />
          <ReviewBadge reviewStatus={execution.reviewStatus} />
        </div>
        <div className="mt-4"><LifecycleStepper status={execution.status} /></div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4 pl-7">
        {/* Context card: gli ID risolti in informazioni leggibili */}
        {ctx && (
          <div className="mb-4 rounded-lg border bg-card p-4">
            <div className="flex items-start gap-2">
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold" title={ctx.alarmName ?? ctx.alarmEventName}>
                  {ctx.alarmName ?? ctx.alarmEventName}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Boxes className="h-3 w-3" />{ctx.productName}<span className="text-muted-foreground/40">·</span>{ctx.environmentName}</span>
                  <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{fmt(ctx.firedAt)}</span>
                  <span className="inline-flex items-center gap-1"><ServerCog className="h-3 w-3" />{ctx.awsAccountId} · {ctx.awsRegion}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <Tabs defaultValue="summary">
          <TabsList className="flex w-full justify-start gap-0.5 overflow-x-auto">
            {tabs.filter((t) => t.show).map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5 whitespace-nowrap">
                <t.icon className="h-3.5 w-3.5" />{t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="summary" className="grid grid-cols-2 gap-x-6 gap-y-3 pt-3">
            {ctx && (
              <div className="col-span-2 flex flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Lanciata da</span>
                <LaunchedByCard ctx={ctx} triggerKind={execution.triggerKind} />
              </div>
            )}
            <Field label="Allarme">{ctx?.alarmName ?? '—'}{execution.alarmId && <span className="ml-1.5"><CopyMono value={execution.alarmId} short /></span>}</Field>
            <Field label="Trigger">{TRIGGER_LABELS[execution.triggerKind]}</Field>
            <Field label="Dispatch">{DISPATCH_LABELS[execution.dispatchKind]}</Field>
            <Field label="Runbook">{execution.runbookKey ?? '—'}{execution.runbookVersion ? ` · v${execution.runbookVersion}` : ''}</Field>
            <Field label="Codice eseguito">{execution.executedRunbookKey ? `${execution.executedRunbookKey} · v${execution.executedRunbookVersion ?? '—'}` : '—'}</Field>
            {execution.requestedRunbookDigest && <div className="col-span-2"><Field label="Definition digest"><CopyMono value={execution.requestedRunbookDigest} /></Field></div>}
            {execution.catalogRevision && <div className="col-span-2"><Field label="Catalog revision"><CopyMono value={execution.catalogRevision} /></Field></div>}
            {execution.workerRevision && <div className="col-span-2"><Field label="Worker revision"><CopyMono value={execution.workerRevision} /></Field></div>}
            {execution.analysisApplyStatus !== 'NOT_APPLICABLE' && (
              <AnalysisApplyDiagnostics
                applyStatus={execution.analysisApplyStatus}
                diagnostics={execution.analysisApplyDiagnostics}
                proposedStatus={proposedStatusOf(execution)}
              />
            )}
            <Field label="Tentativi worker">{execution.totalWorkerAttempts} · ciclo {execution.deliveryCycle}</Field>
            <div className="col-span-2">
              <Field label="Modo applicato">
                <span className="font-medium">{MODE_LABELS[execution.appliedMode]}</span>
                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 align-middle font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{execution.appliedMode}</span>
                <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">{MODE_DESCRIPTIONS[execution.appliedMode]}</span>
                {globalModeOverride && (
                  <span className="mt-1.5 flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-normal text-amber-700 dark:text-amber-300">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Override globale attivo: al completamento si applica <strong className="font-semibold">{MODE_LABELS[globalModeOverride]}</strong>, non questo modo.
                  </span>
                )}
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="Analisi collegata">
                <LinkedAnalysisField analysis={ctx?.linkedAnalysis ?? null} />
              </Field>
            </div>
            <Field label="Creata">{fmt(execution.createdAt)}</Field>
            <Field label="In coda">{fmt(execution.queuedAt)}</Field>
            <Field label="Avviata">{fmt(execution.startedAt)}</Field>
            <Field label="Conclusa">{fmt(execution.completedAt)}</Field>
            <Field label="Deadline">{fmt(execution.deadlineAt)}</Field>
            <Field label="Durata">{execution.durationMs != null ? `${(execution.durationMs / 1000).toFixed(1)} s` : '—'}</Field>
            <div className="col-span-2"><Field label="Execution ID"><CopyMono value={execution.id} /></Field></div>
          </TabsContent>

          {hasInput && (
            <TabsContent value="input" className="pt-3">
              <p className="mb-2 text-xs text-muted-foreground">Snapshot del comando (AutomaticAlarmAnalysisCommandV1).</p>
              <JsonViewer value={execution.inputSnapshot} />
            </TabsContent>
          )}

          {hasResult && (
            <TabsContent value="result" className="space-y-4 pt-3">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Analysis payload</p>
                <JsonViewer value={execution.analysisPayload} />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Result summary</p>
                <JsonViewer value={execution.resultSummary} />
              </div>
            </TabsContent>
          )}

          <TabsContent value="cloudwatch" className="grid grid-cols-2 gap-x-6 gap-y-3 pt-3">
            <Field label="Query"><span className="font-mono">{execution.queryCount ?? '—'}</span></Field>
            <Field label="Bytes scansionati"><span className="font-mono">{execution.bytesScanned ?? '—'}</span></Field>
            <Field label="Record scansionati"><span className="font-mono">{execution.recordsScanned ?? '—'}</span></Field>
            <Field label="Record trovati"><span className="font-mono">{execution.recordsMatched ?? '—'}</span></Field>
          </TabsContent>

          {hasError && (
            <TabsContent value="error" className="pt-3">
              <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-rose-600"><AlertTriangle className="h-4 w-4" />{execution.errorCode}</div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{execution.errorMessage ?? '—'}</p>
              </div>
            </TabsContent>
          )}

          {hasCancel && (
            <TabsContent value="cancellation" className="grid grid-cols-2 gap-x-6 gap-y-3 pt-3">
              <Field label="Richiesta il">{fmt(execution.cancelRequestedAt)}</Field>
              <Field label="Annullata il">{fmt(execution.cancelledAt)}</Field>
              <Field label="Finalizzata da">{execution.cancellationFinalizedBy ?? '—'}</Field>
              <Field label="Motivo">{execution.cancelReason ?? '—'}</Field>
              <p className="col-span-2 text-xs text-muted-foreground">Annullamento cooperativo best-effort: non annulla operazioni esterne già completate.</p>
            </TabsContent>
          )}

          <TabsContent value="attempts" className="pt-3"><AttemptsTab executionId={executionId} /></TabsContent>

          <TabsContent value="related" className="space-y-3 pt-3">
            <Field label="Esecuzione padre">{execution.parentExecutionId ? <CopyMono value={execution.parentExecutionId} /> : 'Nessuna (esecuzione iniziale)'}</Field>
            <Field label="Occorrenza (AlarmEvent)">
              <span className="flex flex-col gap-0.5">
                {ctx && <span className="text-sm">{ctx.alarmEventName} · {fmt(ctx.firedAt)}</span>}
                <CopyMono value={execution.alarmEventId} />
              </span>
            </Field>
            <p className="text-xs text-muted-foreground">Le esecuzioni figlie (retry/re-launch) condividono lo stesso AlarmEvent.</p>
          </TabsContent>
        </Tabs>
      </div>

      {/* Sticky actions */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/30 px-6 py-3 pl-7">
        <ReviewDecisionDialog
          open={reviewDecision !== null}
          decision={reviewDecision ?? 'CONFIRMED'}
          proposedStatus={proposedStatusOf(execution)}
          pending={reviewMutation.isPending}
          onOpenChange={(open) => { if (!open) setReviewDecision(null) }}
          onConfirm={(note) => { if (reviewDecision) reviewMutation.mutate({ decision: reviewDecision, note }) }}
        />
        {canReview && (
          <>
            <Button variant="outline" size="sm" disabled={reviewMutation.isPending} onClick={() => setReviewDecision('CONFIRMED')}><Check className="mr-1 h-4 w-4" /> Conferma</Button>
            <Button variant="outline" size="sm" disabled={reviewMutation.isPending} onClick={() => setReviewDecision('REJECTED')}><X className="mr-1 h-4 w-4" /> Rifiuta</Button>
          </>
        )}
        {canWrite && (
          <Button
            variant="secondary"
            size="sm"
            disabled={!canRetry || retryMutation.isPending}
            title={execution.dispatchKind === 'CLI' ? 'Le esecuzioni CLI non possono essere rilanciate da Watchtower' : undefined}
            onClick={() => retryMutation.mutate()}
          >
            <RefreshCw className="mr-1 h-4 w-4" /> Rilancia
          </Button>
        )}
        {canCancel && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={cancelMutation.isPending}><Ban className="mr-1 h-4 w-4" /> Annulla</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Annullare l&apos;esecuzione?</AlertDialogTitle>
                <AlertDialogDescription>Interrompe l&apos;analisi best-effort. Non annulla operazioni esterne già completate.</AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea placeholder="Motivo (opzionale)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={500} />
              <AlertDialogFooter>
                <AlertDialogCancel>Indietro</AlertDialogCancel>
                <AlertDialogAction onClick={() => cancelMutation.mutate(cancelReason)}>Annulla esecuzione</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {!canWrite && <span className="text-xs text-muted-foreground">Sola lettura</span>}
      </div>
    </>
  )
}

function AttemptsTab({ executionId }: { executionId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: qk.automaticExecutions.attempts(executionId, { page: 1, limit: 50 }),
    queryFn: () => api.getAutomaticExecutionAttempts(executionId, { page: 1, limit: 50 }),
  })
  if (isLoading) return <Skeleton className="h-32 w-full" />
  const attempts = data?.data ?? []
  if (attempts.length === 0) return <p className="text-sm text-muted-foreground">Nessun tentativo registrato.</p>
  return (
    <div className="flex flex-col gap-2.5">
      {attempts.map((a) => (
        <div key={a.id} className="overflow-hidden rounded-lg border">
          <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-muted-foreground">#{a.attemptNumber}</span>
              <AttemptStatusBadge status={a.status} />
            </div>
            {a.retryDisposition && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{a.retryDisposition}</span>}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-2.5 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground"><Database className="h-3 w-3" /> ciclo {a.deliveryCycle} · recv {a.cycleReceiveCount}</div>
            <div className="text-muted-foreground">fase: <span className="text-foreground">{a.phase ?? '—'}</span></div>
            <div className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-3 w-3" /> {fmt(a.startedAt)}</div>
            <div className="text-muted-foreground">→ {fmt(a.finishedAt)}{a.durationMs != null ? ` · ${(a.durationMs / 1000).toFixed(1)}s` : ''}</div>
            <div className="col-span-2 flex items-center justify-between gap-2">
              <CopyMono value={a.sqsMessageId} short />
              {a.errorCode && <span className="font-medium text-rose-600">{a.errorCode}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export type { AutomaticRunbookExecution }
