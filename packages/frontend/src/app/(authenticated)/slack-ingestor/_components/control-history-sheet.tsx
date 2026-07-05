'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Minus, Pencil, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  api,
  type SlackIngestorAutomationRule,
  type SlackIngestorControl,
  type SlackIngestorControlHistoryEntry,
} from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { EXECUTION_POLICY_META, INGESTION_MODE_META, RULE_EFFECT_META } from './labels'

function formatDate(value: string): string {
  return new Date(value).toLocaleString('it-IT')
}

// ─── Diff tra i documenti before/after di una revisione ───────────────────────

interface RuleChange {
  kind: 'added' | 'removed' | 'modified'
  rule: SlackIngestorAutomationRule
  changedFields: string[]
}

interface EntryDiff {
  chips: string[]
  ruleChanges: RuleChange[]
}

function ruleChangedFields(before: SlackIngestorAutomationRule, after: SlackIngestorAutomationRule): string[] {
  const fields: string[] = []
  if (before.name !== after.name) fields.push('nome')
  if ((before.description ?? '') !== (after.description ?? '')) fields.push('descrizione')
  if (before.enabled !== after.enabled) fields.push(after.enabled ? 'abilitata' : 'disabilitata')
  if (before.effect !== after.effect) fields.push(`effetto → ${RULE_EFFECT_META[after.effect].label}`)
  if (JSON.stringify(before.matcher) !== JSON.stringify(after.matcher)) fields.push('condizioni')
  return fields
}

function diffEntry(before?: SlackIngestorControl, after?: SlackIngestorControl): EntryDiff {
  if (!before || !after) return { chips: [], ruleChanges: [] }
  const chips: string[] = []
  if (before.ingestionMode !== after.ingestionMode) {
    chips.push(`Ingestione: ${INGESTION_MODE_META[before.ingestionMode].label} → ${INGESTION_MODE_META[after.ingestionMode].label}`)
  }
  if (before.executionPolicy !== after.executionPolicy) {
    chips.push(`Execution: ${EXECUTION_POLICY_META[before.executionPolicy].label} → ${EXECUTION_POLICY_META[after.executionPolicy].label}`)
  }
  if (before.defaultRuleEffect !== after.defaultRuleEffect) {
    chips.push(`Default: ${RULE_EFFECT_META[before.defaultRuleEffect].label} → ${RULE_EFFECT_META[after.defaultRuleEffect].label}`)
  }

  const beforeById = new Map(before.rules.map((rule) => [rule.id, rule]))
  const afterById = new Map(after.rules.map((rule) => [rule.id, rule]))
  const ruleChanges: RuleChange[] = []
  for (const rule of after.rules) {
    const previous = beforeById.get(rule.id)
    if (!previous) {
      ruleChanges.push({ kind: 'added', rule, changedFields: [] })
    } else {
      const changedFields = ruleChangedFields(previous, rule)
      if (changedFields.length > 0) ruleChanges.push({ kind: 'modified', rule, changedFields })
    }
  }
  for (const rule of before.rules) {
    if (!afterById.has(rule.id)) ruleChanges.push({ kind: 'removed', rule, changedFields: [] })
  }

  const added = ruleChanges.filter((change) => change.kind === 'added').length
  const removed = ruleChanges.filter((change) => change.kind === 'removed').length
  const modified = ruleChanges.filter((change) => change.kind === 'modified').length
  if (added > 0) chips.push(added === 1 ? '+1 regola' : `+${added} regole`)
  if (removed > 0) chips.push(removed === 1 ? '−1 regola' : `−${removed} regole`)
  if (modified > 0) chips.push(modified === 1 ? '1 regola modificata' : `${modified} regole modificate`)

  // Stessi id e stesso contenuto, ma ordine diverso: conta anche quello,
  // perché la prima regola che corrisponde vince.
  if (
    ruleChanges.length === 0 &&
    before.rules.length === after.rules.length &&
    before.rules.some((rule, index) => after.rules[index]?.id !== rule.id)
  ) {
    chips.push('Regole riordinate')
  }

  return { chips, ruleChanges }
}

const CHANGE_KIND_META = {
  added: { icon: Plus, className: 'text-emerald-600' },
  removed: { icon: Minus, className: 'text-rose-600' },
  modified: { icon: Pencil, className: 'text-muted-foreground' },
} as const

function HistoryEntry({ entry }: { entry: SlackIngestorControlHistoryEntry }) {
  const [expanded, setExpanded] = useState(false)
  const before = entry.metadata?.before
  const after = entry.metadata?.after
  const changeNote = entry.metadata?.changeNote?.trim()
  const diff = useMemo(() => diffEntry(before, after), [before, after])

  return (
    <div className="relative pb-6 pl-6 last:pb-0">
      <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" aria-hidden />
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-xs font-semibold">
          {before && after ? `Revisione ${before.revision} → ${after.revision}` : 'Revisione'}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{formatDate(entry.createdAt)}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{entry.userLabel ?? 'Sistema'}</p>
      <p className={cn('mt-1.5 text-sm', changeNote ? 'font-medium' : 'italic text-muted-foreground')}>
        {changeNote ? `“${changeNote}”` : 'Nessuna motivazione registrata'}
      </p>

      {diff.chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {diff.chips.map((chip) => (
            <Badge key={chip} variant="secondary" className="font-normal">{chip}</Badge>
          ))}
        </div>
      )}

      {diff.ruleChanges.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
            Dettaglio regole
          </button>
          {expanded && (
            <ul className="mt-2 space-y-1.5 rounded-md border bg-muted/30 px-3 py-2">
              {diff.ruleChanges.map((change) => {
                const meta = CHANGE_KIND_META[change.kind]
                const Icon = meta.icon
                return (
                  <li key={`${change.kind}-${change.rule.id}`} className="flex items-start gap-2 text-xs">
                    <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', meta.className)} />
                    <span className="min-w-0">
                      <span className="font-medium">{change.rule.name || change.rule.id}</span>
                      <Badge variant={RULE_EFFECT_META[change.rule.effect].variant} className="ml-1.5 px-1.5 py-0 text-[10px]">
                        {RULE_EFFECT_META[change.rule.effect].label}
                      </Badge>
                      {change.kind === 'modified' && (
                        <span className="text-muted-foreground"> — {change.changedFields.join(', ')}</span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export function ControlHistorySheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const query = useQuery({
    queryKey: qk.slackIngestor.history,
    queryFn: api.getSlackIngestorControlHistory,
    enabled: open,
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-lg">
        <div className="flex h-full flex-col">
          <div className="border-b px-6 py-4">
            <SheetTitle>Storico modifiche</SheetTitle>
            <SheetDescription>
              Le ultime revisioni della configurazione, con autore e motivazione registrate nell’audit log.
            </SheetDescription>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {query.isLoading ? (
              <div className="space-y-4">
                {[0, 1, 2].map((index) => <Skeleton key={index} className="h-24 w-full" />)}
              </div>
            ) : query.isError ? (
              <p className="text-sm text-destructive">Impossibile caricare lo storico.</p>
            ) : (query.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna modifica registrata.</p>
            ) : (
              <div className="border-l">
                {query.data!.map((entry) => <HistoryEntry key={entry.id} entry={entry} />)}
              </div>
            )}
          </div>
          <div className="flex justify-end border-t px-6 py-3">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Chiudi
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
