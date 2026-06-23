import { Badge } from '@/components/ui/badge'
import type {
  AutomationExecutionStatus,
  AutomationExecutionOutcome,
  AutomationReviewStatus,
  AutomationTriggerKind,
  AutomationMode,
  AutomationAttemptStatus,
} from '@/lib/api-client'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success'

const STATUS_META: Record<AutomationExecutionStatus, { label: string; variant: BadgeVariant }> = {
  PENDING_DISPATCH: { label: 'In coda (dispatch)', variant: 'secondary' },
  QUEUED: { label: 'In coda', variant: 'secondary' },
  RUNNING: { label: 'In esecuzione', variant: 'default' },
  RETRY_PENDING: { label: 'Retry in attesa', variant: 'secondary' },
  CANCEL_REQUESTED: { label: 'Annullamento in corso', variant: 'outline' },
  SUCCEEDED: { label: 'Completata', variant: 'success' },
  SKIPPED: { label: 'Saltata', variant: 'secondary' },
  FAILED: { label: 'Fallita', variant: 'destructive' },
  CANCELLED: { label: 'Annullata', variant: 'outline' },
}

const OUTCOME_META: Record<AutomationExecutionOutcome, { label: string; variant: BadgeVariant }> = {
  KNOWN_CASE: { label: 'Caso noto', variant: 'success' },
  UNKNOWN_CASE: { label: 'Caso non riconosciuto', variant: 'secondary' },
  NO_DATA: { label: 'Nessun dato', variant: 'secondary' },
  NO_RUNBOOK: { label: 'Nessun runbook', variant: 'outline' },
  CONFIGURATION_ERROR: { label: 'Errore configurazione', variant: 'destructive' },
  EXECUTION_ERROR: { label: 'Errore esecuzione', variant: 'destructive' },
}

const REVIEW_META: Record<AutomationReviewStatus, { label: string; variant: BadgeVariant }> = {
  NOT_REQUIRED: { label: 'Non richiesta', variant: 'outline' },
  PENDING: { label: 'Da revisionare', variant: 'secondary' },
  CONFIRMED: { label: 'Confermata', variant: 'success' },
  REJECTED: { label: 'Rifiutata', variant: 'destructive' },
}

const ATTEMPT_META: Record<AutomationAttemptStatus, { label: string; variant: BadgeVariant }> = {
  RUNNING: { label: 'In esecuzione', variant: 'default' },
  COMPLETED: { label: 'Completato', variant: 'success' },
  INTERRUPTED: { label: 'Interrotto', variant: 'outline' },
  FAILED: { label: 'Fallito', variant: 'destructive' },
  CANCELLED: { label: 'Annullato', variant: 'outline' },
}

export const TRIGGER_LABELS: Record<AutomationTriggerKind, string> = {
  SLACK_INGESTER: 'Slack',
  WATCHTOWER_UI: 'UI',
  WATCHTOWER_API: 'API',
  RETRY: 'Retry',
}

export const MODE_LABELS: Record<AutomationMode, string> = {
  SHADOW: 'Shadow',
  APPLY_KNOWN: 'Apply known',
  APPLY_ALL: 'Apply all',
}

/** Cosa fa concretamente ogni modo di rollout sull'analisi, in parole semplici. */
export const MODE_DESCRIPTIONS: Record<AutomationMode, string> = {
  SHADOW:
    'Solo osservazione: l’esito viene registrato sull’esecuzione ma nessuna analisi viene creata o modificata.',
  APPLY_KNOWN:
    'Applica solo i casi riconosciuti: se l’allarme è un caso noto crea/aggiorna l’analisi automaticamente, altrimenti registra soltanto l’esito senza toccare le analisi.',
  APPLY_ALL:
    'Applica sempre: crea o aggiorna l’analisi sia per i casi noti sia per quelli non riconosciuti.',
}

export function statusLabel(status: AutomationExecutionStatus): string {
  return STATUS_META[status].label
}

/** Control-room accent per stato: barra laterale + dot (+ pulse per RUNNING). */
export const STATUS_ACCENT: Record<AutomationExecutionStatus, { bar: string; dot: string; pulse: boolean }> = {
  PENDING_DISPATCH: { bar: 'border-l-amber-400', dot: 'bg-amber-400', pulse: false },
  QUEUED: { bar: 'border-l-amber-400', dot: 'bg-amber-400', pulse: false },
  RUNNING: { bar: 'border-l-sky-500', dot: 'bg-sky-500', pulse: true },
  RETRY_PENDING: { bar: 'border-l-orange-500', dot: 'bg-orange-500', pulse: false },
  CANCEL_REQUESTED: { bar: 'border-l-fuchsia-500', dot: 'bg-fuchsia-500', pulse: true },
  SUCCEEDED: { bar: 'border-l-emerald-500', dot: 'bg-emerald-500', pulse: false },
  SKIPPED: { bar: 'border-l-zinc-400', dot: 'bg-zinc-400', pulse: false },
  FAILED: { bar: 'border-l-rose-500', dot: 'bg-rose-500', pulse: false },
  CANCELLED: { bar: 'border-l-zinc-500', dot: 'bg-zinc-500', pulse: false },
}

/** Tappe del lifecycle per lo stepper del dettaglio. */
export const LIFECYCLE_STEPS = ['PENDING_DISPATCH', 'QUEUED', 'RUNNING', 'TERMINAL'] as const

export function StatusDot({ status, className }: { status: AutomationExecutionStatus; className?: string }) {
  const a = STATUS_ACCENT[status]
  return (
    <span className={`relative inline-flex h-2 w-2 ${className ?? ''}`}>
      {a.pulse && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${a.dot}`} />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${a.dot}`} />
    </span>
  )
}

export function StatusBadge({ status }: { status: AutomationExecutionStatus }) {
  const meta = STATUS_META[status]
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusDot status={status} />
      <Badge variant={meta.variant}>{meta.label}</Badge>
    </span>
  )
}

export function OutcomeBadge({ outcome }: { outcome: AutomationExecutionOutcome | null }) {
  if (!outcome) return <span className="text-muted-foreground">—</span>
  const meta = OUTCOME_META[outcome]
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}

export function ReviewBadge({ reviewStatus }: { reviewStatus: AutomationReviewStatus }) {
  const meta = REVIEW_META[reviewStatus]
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}

export function AttemptStatusBadge({ status }: { status: AutomationAttemptStatus }) {
  const meta = ATTEMPT_META[status]
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}
