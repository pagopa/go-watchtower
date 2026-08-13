import { Badge } from '@/components/ui/badge'
import type {
  AutomationExecutionStatus,
  AutomationExecutionOutcome,
  AutomationReviewStatus,
  AutomationAttemptStatus,
  AutomationAnalysisApplyStatus,
} from '@/lib/api-client'
import { APPLY_META, ATTEMPT_META, OUTCOME_META, REVIEW_META, STATUS_ACCENT, STATUS_META } from './badge-meta'

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

/**
 * Esito dell'apply dell'analisi.
 *
 * Distinto dalla review: `APPLIED` significa «draft materializzato», non
 * «analisi approvata». `BLOCKED` alimenta la coda remediation, non quella review.
 */
export function ApplyStatusBadge({ status }: { status: AutomationAnalysisApplyStatus }) {
  const meta = APPLY_META[status]
  return <Badge variant={meta.variant} title={meta.hint}>{meta.label}</Badge>
}

export function AttemptStatusBadge({ status }: { status: AutomationAttemptStatus }) {
  const meta = ATTEMPT_META[status]
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}
