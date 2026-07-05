'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, FlaskConical, History, Loader2, RotateCcw, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import {
  api,
  ApiClientError,
  type Alarm,
  type Environment,
  type SlackIngestorControl,
  type SlackIngestorControlPreview,
  type SlackIngestorControlWarning,
} from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { EXECUTION_POLICY_META, INGESTION_MODE_META, decisionMeta } from './labels'
import { RichSelect } from './rich-select'
import { RuleEditor, isGlobalRule, isQuickRule, type RuleEditorSources } from './rule-editor'
import { ControlHistorySheet } from './control-history-sheet'

function extractValidationIssues(error: unknown): SlackIngestorControlWarning[] {
  if (!(error instanceof ApiClientError)) return []
  const data = error.data as { details?: { errors?: SlackIngestorControlWarning[] } } | undefined
  return data?.details?.errors ?? []
}

function PreviewDialog({
  open,
  onOpenChange,
  preview,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  preview: SlackIngestorControlPreview | null
}) {
  const counts = Object.entries(preview?.counts ?? {}).sort(([, a], [, b]) => b - a)
  const byRunbook = Object.entries(preview?.byRunbook ?? {}).sort(([, a], [, b]) => b - a)
  const total = counts.reduce((sum, [, count]) => sum + count, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Anteprima impatto</DialogTitle>
          <DialogDescription>
            Simulazione della configurazione in bozza sugli ultimi {preview?.sampleSize ?? 0} eventi allarme importati.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            {counts.map(([decision, count]) => {
              const meta = decisionMeta(decision)
              const share = total > 0 ? Math.round((count / total) * 100) : 0
              return (
                <div key={decision} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {count} · {share}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${meta.dot}`} style={{ width: `${share}%` }} />
                  </div>
                </div>
              )
            })}
            {counts.length === 0 && <p className="text-sm text-muted-foreground">Nessun evento nel campione.</p>}
          </div>
          {byRunbook.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Runbook coinvolti</p>
              <div className="space-y-1">
                {byRunbook.slice(0, 8).map(([key, count]) => (
                  <div key={key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-mono text-xs">{key}</span>
                    <span className="font-mono text-xs text-muted-foreground">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ControlTab({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: qk.slackIngestor.control, queryFn: api.getSlackIngestorControl })

  const [draft, setDraft] = useState<SlackIngestorControl | null>(null)
  const [changeNote, setChangeNote] = useState('')
  const [confirmGlobal, setConfirmGlobal] = useState(false)
  const [saveIssues, setSaveIssues] = useState<SlackIngestorControlWarning[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewData, setPreviewData] = useState<SlackIngestorControlPreview | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    const control = query.data?.control
    if (!control) return
    // Reinizializza la bozza solo al primo caricamento o quando la revisione
    // sul server cambia: un semplice refetch non deve scartare le modifiche.
    setDraft((current) => (!current || current.revision !== control.revision ? control : current))
  }, [query.data])

  // ── Sorgenti per le select dell'editor ──────────────────────────────────────
  const productsQuery = useQuery({ queryKey: qk.products.list, queryFn: api.getProducts })
  const productIds = useMemo(() => (productsQuery.data ?? []).map((product) => product.id), [productsQuery.data])
  const environmentsQuery = useQuery<Environment[]>({
    queryKey: qk.products.allEnvironments(productIds),
    queryFn: async () => (await Promise.all(productIds.map((id) => api.getEnvironments(id)))).flat(),
    enabled: productIds.length > 0,
    staleTime: 5 * 60 * 1000,
  })
  const alarmsQuery = useQuery<Alarm[]>({
    queryKey: qk.products.allAlarms(productIds),
    queryFn: async () => (await Promise.all(productIds.map((id) => api.getAlarms(id)))).flat(),
    enabled: productIds.length > 0,
    staleTime: 5 * 60 * 1000,
  })
  const channelsQuery = useQuery({ queryKey: qk.slackIngestor.channels, queryFn: api.getSlackIngestorChannels })
  const catalogQuery = useQuery({ queryKey: qk.automaticRunbookCatalog.list, queryFn: api.getAutomaticRunbookCatalog })
  const prioritiesQuery = useQuery({ queryKey: qk.priorityLevels.list, queryFn: api.getPriorityLevels })

  const sources = useMemo<RuleEditorSources>(() => {
    const productName = new Map((productsQuery.data ?? []).map((product) => [product.id, product.name]))
    const capabilities = catalogQuery.data?.data ?? []
    const channels = channelsQuery.data ?? []
    const channelOptions = new Map<string, string>()
    for (const environment of channels) {
      if (!environment.slackChannelId) continue
      const context = `${environment.product.name} / ${environment.name}`
      const existing = channelOptions.get(environment.slackChannelId)
      channelOptions.set(environment.slackChannelId, existing ? `${existing}, ${context}` : context)
    }
    return {
      products: (productsQuery.data ?? []).map((product) => ({ value: product.id, label: product.name })),
      environments: (environmentsQuery.data ?? []).map((environment) => ({
        value: environment.id,
        label: `${productName.get(environment.productId) ?? '?'} · ${environment.name}`,
        productId: environment.productId,
      })),
      alarms: (alarmsQuery.data ?? []).map((alarm) => ({
        value: alarm.id,
        label: `${productName.get(alarm.productId) ?? '?'} · ${alarm.name}`,
        productId: alarm.productId,
      })),
      channels: [...channelOptions.entries()].map(([id, context]) => ({ value: id, label: `${id} — ${context}` })),
      runbooks: capabilities.map((capability) => ({
        value: capability.key,
        label: capability.name ? `${capability.name} (${capability.key})` : capability.key,
      })),
      runbookCategories: [...new Set(capabilities.flatMap((capability) => capability.categories))].sort().map((category) => ({
        value: category,
        label: category,
      })),
      priorities: (prioritiesQuery.data ?? []).map((priority) => ({
        value: priority.code,
        label: `${priority.label} (${priority.code})`,
      })),
      alarmNameSuggestions: [
        ...new Set([
          ...capabilities.flatMap((capability) => capability.alarmNames),
          ...(alarmsQuery.data ?? []).map((alarm) => alarm.name),
        ]),
      ].sort(),
      awsRegionSuggestions: [
        ...new Set(channels.flatMap((environment) => (environment.defaultAwsRegion ? [environment.defaultAwsRegion] : []))),
      ].sort(),
      awsAccountSuggestions: [
        ...new Set(channels.flatMap((environment) => (environment.defaultAwsAccountId ? [environment.defaultAwsAccountId] : []))),
      ].sort(),
    }
  }, [productsQuery.data, environmentsQuery.data, alarmsQuery.data, channelsQuery.data, catalogQuery.data, prioritiesQuery.data])

  // ── Stato della bozza ───────────────────────────────────────────────────────
  const server = query.data?.control
  const isDirty = Boolean(draft && server && JSON.stringify(draft) !== JSON.stringify(server))
  const hasGlobalRule = Boolean(draft?.rules.some((rule) => !isQuickRule(rule) && isGlobalRule(rule)))
  const unnamedRules = draft?.rules.filter((rule) => !rule.name.trim()).length ?? 0
  const canSave =
    canWrite && isDirty && changeNote.trim() !== '' && unnamedRules === 0 && (!hasGlobalRule || confirmGlobal)

  const mutation = useMutation({
    mutationFn: api.updateSlackIngestorControl,
    onSuccess: (result) => {
      queryClient.setQueryData(qk.slackIngestor.control, result)
      void queryClient.invalidateQueries({ queryKey: qk.automaticRunbookCatalog.root })
      void queryClient.invalidateQueries({ queryKey: qk.slackIngestor.history })
      setChangeNote('')
      setConfirmGlobal(false)
      setSaveIssues([])
      toast.success(`Configurazione salvata (revisione ${result.control.revision})`)
    },
    onError: (error: Error) => {
      setSaveIssues(extractValidationIssues(error))
      toast.error(error.message === 'CONTROL_VALIDATION_FAILED' ? 'La configurazione non è valida' : error.message)
    },
  })

  const previewMutation = useMutation({
    mutationFn: (control: SlackIngestorControl) =>
      api.previewSlackIngestorControl({ control, confirmGlobalMatchers: true }),
    onSuccess: (result) => {
      setSaveIssues([])
      setPreviewData(result.preview)
      setPreviewOpen(true)
    },
    onError: (error: Error) => {
      setSaveIssues(extractValidationIssues(error))
      toast.error('Impossibile simulare: la configurazione non è valida')
    },
  })

  const save = () => {
    if (!draft || !server) return
    mutation.mutate({
      control: draft,
      expectedRevision: server.revision,
      changeNote: changeNote.trim(),
      confirmGlobalMatchers: hasGlobalRule ? confirmGlobal : undefined,
    })
  }

  if (query.isLoading || !draft) return <Skeleton className="h-96 w-full" />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Revisione attiva <span className="font-mono font-semibold text-foreground">{server?.revision ?? draft.revision}</span>
        </p>
        <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
          <History className="mr-2 h-4 w-4" />
          Storico
        </Button>
      </div>

      {query.data?.catalogReferenceHealth === 'UNSAFE' && (
        <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <ShieldAlert className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold">Scope non sicuro</p>
            <p className="text-muted-foreground">
              Alcuni riferimenti al catalogo non si risolvono e potrebbero ampliare lo scope: le execution automatiche
              restano bloccate finché non vengono corretti.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Controlli globali</CardTitle>
          <CardDescription>
            Interruttori principali dell’ingestor: valgono per tutti i canali e tutte le regole.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Ingestione da Slack</Label>
            <RichSelect
              value={draft.ingestionMode}
              disabled={!canWrite}
              options={(['ENABLED', 'PAUSED'] as const).map((mode) => ({
                value: mode,
                label: INGESTION_MODE_META[mode].label,
                description: INGESTION_MODE_META[mode].description,
              }))}
              onValueChange={(ingestionMode) => setDraft({ ...draft, ingestionMode })}
              renderValuePrefix={(mode) => (
                <span className={`h-2 w-2 shrink-0 rounded-full ${mode === 'ENABLED' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              )}
            />
            <p className="text-xs text-muted-foreground">{INGESTION_MODE_META[draft.ingestionMode].description}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Creazione execution automatiche</Label>
            <RichSelect
              value={draft.executionPolicy}
              disabled={!canWrite}
              options={(['OFF', 'AVAILABLE_ONLY'] as const).map((policy) => ({
                value: policy,
                label: EXECUTION_POLICY_META[policy].label,
                description: EXECUTION_POLICY_META[policy].description,
              }))}
              onValueChange={(executionPolicy) => setDraft({ ...draft, executionPolicy })}
              renderValuePrefix={(policy) => (
                <span className={`h-2 w-2 shrink-0 rounded-full ${policy === 'AVAILABLE_ONLY' ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
              )}
            />
            <p className="text-xs text-muted-foreground">{EXECUTION_POLICY_META[draft.executionPolicy].description}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regole di scope</CardTitle>
          <CardDescription>
            Le regole sono valutate dall’alto verso il basso: la prima che corrisponde decide. Trascina o usa le frecce
            per cambiare l’ordine.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RuleEditor
            rules={draft.rules}
            onChange={(rules) => setDraft({ ...draft, rules })}
            defaultRuleEffect={draft.defaultRuleEffect}
            onDefaultRuleEffectChange={(defaultRuleEffect) => setDraft({ ...draft, defaultRuleEffect })}
            sources={sources}
            warnings={query.data?.warnings ?? []}
            disabled={!canWrite}
          />
        </CardContent>
      </Card>

      {(query.data?.warnings.some((warning) => !warning.ruleId) || saveIssues.length > 0) && (
        <div className="space-y-2">
          {saveIssues.map((issue, index) => (
            <div key={`error-${index}`} className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>{issue.message}</span>
            </div>
          ))}
          {(query.data?.warnings ?? [])
            .filter((warning) => !warning.ruleId)
            .map((warning, index) => (
              <div key={`warning-${index}`} className="flex gap-2 rounded-md bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>{warning.message}</span>
              </div>
            ))}
        </div>
      )}

      {/* Barra di salvataggio: appare solo con modifiche in sospeso */}
      {canWrite && isDirty && (
        <div className="sticky bottom-0 z-40 rounded-lg border bg-background/95 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="flex flex-col gap-3 px-4 py-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="change-note" className="text-xs">
                  Motivazione della modifica <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="change-note"
                  value={changeNote}
                  onChange={(event) => setChangeNote(event.target.value)}
                  placeholder="Registrata nell’audit log insieme alla nuova revisione"
                  className="h-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraft(server ?? null)
                    setChangeNote('')
                    setConfirmGlobal(false)
                    setSaveIssues([])
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Ripristina
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={previewMutation.isPending}
                  onClick={() => previewMutation.mutate(draft)}
                >
                  {previewMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FlaskConical className="mr-2 h-4 w-4" />
                  )}
                  Anteprima impatto
                </Button>
                <Button size="sm" disabled={!canSave || mutation.isPending} onClick={save}>
                  {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salva revisione {draft.revision + 1}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {hasGlobalRule && (
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <Checkbox checked={confirmGlobal} onChange={(event) => setConfirmGlobal(event.target.checked)} />
                  <span>
                    Confermo la presenza di <span className="font-medium">regole globali senza condizioni</span>
                  </span>
                </label>
              )}
              {unnamedRules > 0 && (
                <Badge variant="outline" className="border-destructive/50 text-destructive">
                  {unnamedRules === 1 ? '1 regola senza nome' : `${unnamedRules} regole senza nome`}
                </Badge>
              )}
            </div>
          </div>
        </div>
      )}

      <PreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} preview={previewData} />
      <ControlHistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  )
}
