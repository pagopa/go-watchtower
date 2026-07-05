'use client'

import { useQuery } from '@tanstack/react-query'
import { Bot, CheckCircle2, CirclePause, Database, RadioTower } from 'lucide-react'
import { api } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  EXECUTION_POLICY_META,
  INGESTION_MODE_META,
  catalogHealthMeta,
  decisionMeta,
  referenceHealthMeta,
} from './labels'

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('it-IT')
}

function shortHash(value: string | null | undefined): string {
  if (!value) return '—'
  return value.length > 20 ? `${value.slice(0, 12)}…${value.slice(-6)}` : value
}

export function OverviewTab() {
  const controlQuery = useQuery({
    queryKey: qk.slackIngestor.control,
    queryFn: api.getSlackIngestorControl,
    refetchInterval: 30_000,
  })
  const catalogQuery = useQuery({
    queryKey: qk.automaticRunbookCatalog.status,
    queryFn: api.getAutomaticRunbookCatalogStatus,
    refetchInterval: 30_000,
  })
  const coverageQuery = useQuery({
    queryKey: qk.automaticRunbookCatalog.coverage,
    queryFn: api.getAutomaticRunbookCatalogCoverage,
    refetchInterval: 30_000,
  })
  const statusQuery = useQuery({
    queryKey: [...qk.slackIngestor.root, 'status'],
    queryFn: api.getSlackIngestorStatus,
    refetchInterval: 30_000,
  })

  const control = controlQuery.data?.control
  const catalog = catalogQuery.data
  const coverage = coverageQuery.data
  const isLocalCatalog = catalog?.sourceVersionId?.startsWith('local:') ?? false
  const catalogHealth = catalogHealthMeta(catalog?.health)
  const referenceHealth = referenceHealthMeta(controlQuery.data?.catalogReferenceHealth)

  const decisions = (statusQuery.data?.decisionStats ?? [])
    .map((entry) => ({ ...decisionMeta(entry.automationDecision), count: entry._count }))
    .sort((a, b) => b.count - a.count)
  const decisionsTotal = decisions.reduce((sum, entry) => sum + entry.count, 0)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Ingestione Slack</CardDescription></CardHeader>
          <CardContent className="flex items-center gap-2">
            {control?.ingestionMode === 'ENABLED' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <CirclePause className="h-5 w-5 text-amber-600" />
            )}
            <span className="font-semibold">{control ? INGESTION_MODE_META[control.ingestionMode].label : '—'}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Execution automatiche</CardDescription></CardHeader>
          <CardContent className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <span className="font-semibold">{control ? EXECUTION_POLICY_META[control.executionPolicy].label : '—'}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Catalogo runbook</CardDescription></CardHeader>
          <CardContent className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <Badge variant={catalogHealth.variant}>{catalogHealth.label}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Runbook disponibili</CardDescription></CardHeader>
          <CardContent className="font-mono text-2xl font-bold">{coverage?.total ?? '—'}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Canali abilitati</CardDescription></CardHeader>
          <CardContent className="font-mono text-2xl font-bold">{statusQuery.data?.enabledChannels ?? '—'}</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configurazione attiva</CardTitle>
            <CardDescription>La policy decide se creare execution; le regole ne delimitano lo scope.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Revisione</span><span className="font-mono">{control?.revision ?? '—'}</span></div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Se nessuna regola corrisponde</span>
              <span>{control ? (control.defaultRuleEffect === 'ALLOW' ? 'Consenti' : 'Blocca') : '—'}</span>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Regole</span><span>{control?.rules.length ?? '—'}</span></div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Riferimenti catalogo</span>
              <Badge variant={referenceHealth.variant}>{referenceHealth.label}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sorgente catalogo</CardTitle>
            <CardDescription>
              {isLocalCatalog
                ? 'Catalogo locale importato direttamente nel database.'
                : 'Ultimo catalogo verificato e copiato da S3 nel database.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sorgente</span>
              <Badge variant="outline">{isLocalCatalog ? 'Locale' : catalog?.sourceVersionId ? 'S3' : '—'}</Badge>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Revisione</span>
              <span className="truncate font-mono" title={catalog?.revision ?? ''}>{shortHash(catalog?.revision)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Worker</span>
              <span className="truncate font-mono">{shortHash(catalog?.workerArtifactRevision)}</span>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Ultima verifica</span><span>{formatDate(catalog?.lastVerifiedAt ?? null)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Valido fino a</span><span>{formatDate(catalog?.validUntil ?? null)}</span></div>
            {catalog?.lastError && <p className="rounded-md bg-destructive/10 p-2 text-destructive">{catalog.lastError}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RadioTower className="h-4 w-4 text-primary" />
              Decisioni ultime 24 ore
            </CardTitle>
            <CardDescription>Esito della valutazione di automazione sugli eventi importati.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {decisions.length === 0 && <p className="text-sm text-muted-foreground">Nessun evento nelle ultime 24 ore.</p>}
            {decisions.map((entry) => {
              const share = decisionsTotal > 0 ? Math.round((entry.count / decisionsTotal) * 100) : 0
              return (
                <div key={entry.label} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${entry.dot}`} />
                      <span className="truncate">{entry.label}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{entry.count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${entry.dot}`} style={{ width: `${share}%` }} />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
