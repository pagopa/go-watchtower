'use client'

import { Ban, Eye, Info } from 'lucide-react'
import type { AnalysisApplyDiagnosticsV1, AutomationAnalysisApplyStatus } from '@/lib/api-client'
import { blockCodeLabel } from './badges'

interface AnalysisApplyDiagnosticsProps {
  readonly applyStatus: AutomationAnalysisApplyStatus
  readonly diagnostics: AnalysisApplyDiagnosticsV1 | null | undefined
  readonly proposedStatus: 'IN_PROGRESS' | 'COMPLETED' | undefined
}

/**
 * Spiega perché l'analisi è stata materializzata, bloccata o solo valutata.
 *
 * Tiene separate le tre domande che il documento non confonde mai: cosa è stato
 * scritto (`applyStatus`), cosa verrebbe scritto in un modo applicante
 * (`wouldApplyStatus`), e cosa succederà alla conferma (`proposedStatus`).
 */
export function AnalysisApplyDiagnostics({
  applyStatus,
  diagnostics,
  proposedStatus,
}: AnalysisApplyDiagnosticsProps) {
  const unresolved = diagnostics?.unresolvedReferences
  const unresolvedGroups: { label: string; values: string[] }[] = [
    { label: 'Risorse', values: unresolved?.resources ?? [] },
    { label: 'Downstream', values: unresolved?.downstreams ?? [] },
    { label: 'Final action', values: unresolved?.finalActions ?? [] },
    ...(unresolved?.ignoreReasonCode ? [{ label: 'Ignore reason', values: [unresolved.ignoreReasonCode] }] : []),
  ].filter((group) => group.values.length > 0)

  return (
    <div className="col-span-2 space-y-2">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Analisi automatica</span>

      {applyStatus === 'APPLIED' && (
        <Callout tone="info" icon={Info}>
          Analisi <strong>materializzata in attesa di conferma</strong>: è stata scritta in stato{' '}
          <code className="font-mono text-[11px]">IN_PROGRESS</code> e l&apos;allarme resta aperto.
          {proposedStatus === 'COMPLETED' ? (
            <> Confermando, verrà completata e l&apos;allarme risolto.</>
          ) : (
            <> Confermando, resterà in lavorazione.</>
          )}
        </Callout>
      )}

      {applyStatus === 'BLOCKED' && diagnostics?.blockCode && (
        <Callout tone="danger" icon={Ban}>
          <strong>Nessuna analisi scritta.</strong> {blockCodeLabel(diagnostics.blockCode)}.
          <span className="mt-1 block text-xs opacity-80">
            Non è una revisione da approvare: va corretta la configurazione e rieseguito il runbook.
          </span>
        </Callout>
      )}

      {diagnostics?.evaluatedOnly && (
        <Callout tone="muted" icon={Eye}>
          Valutazione senza scritture.
          {diagnostics.wouldApplyStatus && (
            <>
              {' '}In un modo applicante l&apos;esito sarebbe{' '}
              <strong>{diagnostics.wouldApplyStatus === 'APPLIED' ? 'materializzata' : 'bloccata'}</strong>
              {diagnostics.blockCode ? <> — {blockCodeLabel(diagnostics.blockCode)}</> : null}.
            </>
          )}
          {diagnostics.contextValidationStatus && (
            <>
              {' '}Contesto del caso non riconosciuto:{' '}
              <strong>{diagnostics.contextValidationStatus === 'VALID' ? 'valido' : 'non valido'}</strong>. Un caso non
              riconosciuto non materializza mai un&apos;analisi.
            </>
          )}
        </Callout>
      )}

      {unresolvedGroups.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5">
          <span className="text-xs font-medium">Riferimenti non presenti nel censimento</span>
          <ul className="mt-1.5 space-y-1">
            {unresolvedGroups.map((group) => (
              <li key={group.label} className="text-xs">
                <span className="text-muted-foreground">{group.label}:</span>{' '}
                <span className="font-mono">{group.values.join(', ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(diagnostics?.errors?.length ?? 0) > 0 && (
        <IssueList title="Regole non soddisfatte" issues={diagnostics?.errors ?? []} tone="danger" />
      )}
      {(diagnostics?.warnings?.length ?? 0) > 0 && (
        <IssueList title="Segnalazioni" issues={diagnostics?.warnings ?? []} tone="warning" />
      )}

      {diagnostics?.draftDigest && (
        <p className="text-xs text-muted-foreground">
          Draft non conservato perché oltre il budget: {diagnostics.draftDigest.byteLength.toLocaleString('it-IT')} byte,
          sha256 <code className="font-mono">{diagnostics.draftDigest.sha256.slice(0, 12)}…</code>
        </p>
      )}
    </div>
  )
}

function IssueList({
  title,
  issues,
  tone,
}: {
  title: string
  issues: { ruleId: string; message: string }[]
  tone: 'danger' | 'warning'
}) {
  const border = tone === 'danger' ? 'border-destructive/40 bg-destructive/5' : 'border-amber-500/40 bg-amber-500/10'
  return (
    <div className={`rounded-md border p-2.5 ${border}`}>
      <span className="text-xs font-medium">{title}</span>
      <ul className="mt-1.5 space-y-1">
        {issues.map((issue) => (
          <li key={`${issue.ruleId}-${issue.message}`} className="text-xs">
            <code className="font-mono text-[10px] text-muted-foreground">{issue.ruleId}</code>{' '}
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Callout({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'info' | 'danger' | 'muted'
  icon: React.ElementType
  children: React.ReactNode
}) {
  const styles = {
    info: 'border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200',
    danger: 'border-destructive/40 bg-destructive/5 text-destructive',
    muted: 'border-border bg-muted/40 text-muted-foreground',
  }[tone]
  return (
    <div className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs leading-relaxed ${styles}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}
