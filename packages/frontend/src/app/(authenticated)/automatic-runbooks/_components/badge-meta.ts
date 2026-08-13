import type {
  AutomationExecutionStatus,
  AutomationExecutionOutcome,
  AutomationReviewStatus,
  AutomationTriggerKind,
  AutomationDispatchKind,
  AutomationMode,
  AutomationAttemptStatus,
  AutomationAnalysisApplyStatus,
  AnalysisApplyBlockCode,
} from '@/lib/api-client'

/**
 * Etichette e accenti dei badge delle esecuzioni automatiche.
 *
 * Separati da `badges.tsx` perché un file che esporta anche non componenti
 * impedisce a Fast Refresh di preservare lo stato dei componenti che contiene.
 */

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success'

export const STATUS_META: Record<AutomationExecutionStatus, { label: string; variant: BadgeVariant }> = {
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

export const OUTCOME_META: Record<AutomationExecutionOutcome, { label: string; variant: BadgeVariant }> = {
  KNOWN_CASE: { label: 'Caso noto', variant: 'success' },
  UNKNOWN_CASE: { label: 'Caso non riconosciuto', variant: 'secondary' },
  NO_DATA: { label: 'Nessun dato', variant: 'secondary' },
  CAPABILITY_WITHDRAWN: { label: 'Runbook ritirato', variant: 'outline' },
  CONFIGURATION_ERROR: { label: 'Errore configurazione', variant: 'destructive' },
  EXECUTION_ERROR: { label: 'Errore esecuzione', variant: 'destructive' },
}

export const REVIEW_META: Record<AutomationReviewStatus, { label: string; variant: BadgeVariant }> = {
  NOT_REQUIRED: { label: 'Non richiesta', variant: 'outline' },
  PENDING: { label: 'Da revisionare', variant: 'secondary' },
  CONFIRMED: { label: 'Confermata', variant: 'success' },
  REJECTED: { label: 'Rifiutata', variant: 'destructive' },
}

export const APPLY_META: Record<AutomationAnalysisApplyStatus, { label: string; variant: BadgeVariant; hint: string }> = {
  PENDING: { label: 'In corso', variant: 'secondary', hint: 'Apply non ancora concluso' },
  APPLIED: { label: 'Materializzata', variant: 'default', hint: 'Draft applicato: in attesa di conferma umana' },
  BLOCKED: { label: 'Bloccata', variant: 'destructive', hint: 'Nessuna analisi scritta: serve una correzione' },
  NOT_REQUESTED: { label: 'Non richiesta', variant: 'outline', hint: 'Modo non applicante o esito unknown' },
  PRESERVED_HUMAN: { label: 'Analisi umana', variant: 'outline', hint: "Analisi dell'operatore preservata" },
  NOT_APPLICABLE: { label: 'Non applicabile', variant: 'outline', hint: 'Esito senza analisi' },
}

const BLOCK_CODE_LABELS: Record<AnalysisApplyBlockCode, string> = {
  ALARM_UNLINKED: "L'evento non è più collegato a un allarme censito",
  DRAFT_TOO_LARGE: 'Draft oltre il budget di 64 KiB',
  MISSING_DRAFT: 'Il worker non ha inviato il draft',
  INVALID_DRAFT: 'Draft non conforme allo schema',
  TEMPORAL_INCOHERENCE: 'Date incoerenti fra allarme e analisi',
  UNRESOLVED_REFERENCES: 'Riferimenti dichiarati non presenti nel censimento',
  RESOURCE_TYPE_MISMATCH: 'Tipo risorsa diverso da quello censito',
  INVALID_IGNORE_DETAILS: 'Dettagli di ignore non conformi allo schema',
  VALIDATION_ERRORS: 'Regole di validità non soddisfatte',
}

export const ATTEMPT_META: Record<AutomationAttemptStatus, { label: string; variant: BadgeVariant }> = {
  RUNNING: { label: 'In esecuzione', variant: 'default' },
  COMPLETED: { label: 'Completato', variant: 'success' },
  INTERRUPTED: { label: 'Interrotto', variant: 'outline' },
  FAILED: { label: 'Fallito', variant: 'destructive' },
  CANCELLED: { label: 'Annullato', variant: 'outline' },
}

export const TRIGGER_LABELS: Record<AutomationTriggerKind, string> = {
  SLACK_INGESTOR: 'Slack',
  WATCHTOWER_UI: 'UI',
  WATCHTOWER_API: 'API',
  WATCHTOWER_CLI: 'CLI',
  RETRY: 'Retry',
}

export const DISPATCH_LABELS: Record<AutomationDispatchKind, string> = {
  SQS: 'SQS',
  CLI: 'Locale CLI',
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

export function statusLabel(status: AutomationExecutionStatus): string {
  return STATUS_META[status].label
}

/** Motivo del blocco, in forma leggibile. */
export function blockCodeLabel(code: AnalysisApplyBlockCode): string {
  return BLOCK_CODE_LABELS[code] ?? code
}
