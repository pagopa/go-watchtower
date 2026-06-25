'use client'

import { useEffect, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Bot, RotateCw, Loader2, ListChecks, Inbox, AlertTriangle, CheckCircle2, XCircle, Play } from 'lucide-react'
import { api, type AutomaticExecutionListParams } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { usePermissions } from '@/hooks/use-permissions'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { StatusBadge, OutcomeBadge, ReviewBadge, TRIGGER_LABELS, STATUS_ACCENT } from './_components/badges'
import { ExecutionDetailPanel } from './_components/execution-detail-panel'
import { ExecuteRunbookPicker } from './_components/execute-runbook-picker'
import { GlobalOverrideBanner } from './_components/global-override-banner'

const ALL = 'ALL'

const STATUS_OPTIONS = [
  ['PENDING_DISPATCH', 'In coda (dispatch)'], ['QUEUED', 'In coda'], ['RUNNING', 'In esecuzione'],
  ['RETRY_PENDING', 'Retry in attesa'], ['CANCEL_REQUESTED', 'Annullamento in corso'],
  ['SUCCEEDED', 'Completata'], ['SKIPPED', 'Saltata'], ['FAILED', 'Fallita'], ['CANCELLED', 'Annullata'],
] as const
const OUTCOME_OPTIONS = [
  ['KNOWN_CASE', 'Caso noto'], ['UNKNOWN_CASE', 'Caso non riconosciuto'], ['NO_DATA', 'Nessun dato'],
  ['NO_RUNBOOK', 'Nessun runbook'], ['CONFIGURATION_ERROR', 'Errore configurazione'], ['EXECUTION_ERROR', 'Errore esecuzione'],
] as const
const REVIEW_OPTIONS = [
  ['NOT_REQUIRED', 'Non richiesta'], ['PENDING', 'Da revisionare'], ['CONFIRMED', 'Confermata'], ['REJECTED', 'Rifiutata'],
] as const
const TRIGGER_OPTIONS = [
  ['SLACK_INGESTOR', 'Slack'], ['WATCHTOWER_UI', 'UI'], ['WATCHTOWER_API', 'API'], ['RETRY', 'Retry'],
] as const

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60000)
  if (m < 1) return 'adesso'
  if (m < 60) return `${m} min fa`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h fa`
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}

function StatCard({
  label, value, icon: Icon, accent, attention,
}: {
  label: string
  value: number | undefined
  icon: React.ElementType
  accent: string
  attention?: boolean
}) {
  return (
    <div className={`relative overflow-hidden rounded-lg border border-l-[3px] bg-card p-4 ${accent} ${attention && value ? 'ring-1 ring-amber-400/40' : ''}`}>
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground/60" />
      </div>
      <div className="mt-2 font-mono text-3xl font-bold tabular-nums">{value ?? '—'}</div>
    </div>
  )
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options: readonly (readonly [string, string])[]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`w-[185px] ${value !== ALL ? 'border-primary/50 text-foreground' : ''}`}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: tutti</SelectItem>
        {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export function AutomaticRunbooksPageContent() {
  const { can, isLoading: permsLoading } = usePermissions()
  const canRead = can('AUTOMATIC_RUNBOOK_EXECUTION', 'read')
  const canWrite = can('AUTOMATIC_RUNBOOK_EXECUTION', 'write')

  const [page, setPage] = useState(1)
  const [status, setStatus] = useState(ALL)
  const [outcome, setOutcome] = useState(ALL)
  const [reviewStatus, setReviewStatus] = useState(ALL)
  const [triggerKind, setTriggerKind] = useState(ALL)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Deep-link: ?execution=<id> apre il dettaglio (es. dal toast "Apri" dopo un lancio).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('execution')
    if (id) setSelectedId(id)
  }, [])

  const limit = 50
  const params: AutomaticExecutionListParams = {
    page, limit,
    ...(status !== ALL ? { status: status as AutomaticExecutionListParams['status'] } : {}),
    ...(outcome !== ALL ? { outcome: outcome as AutomaticExecutionListParams['outcome'] } : {}),
    ...(reviewStatus !== ALL ? { reviewStatus: reviewStatus as AutomaticExecutionListParams['reviewStatus'] } : {}),
    ...(triggerKind !== ALL ? { triggerKind: triggerKind as AutomaticExecutionListParams['triggerKind'] } : {}),
  }

  const statsQuery = useQuery({ queryKey: qk.automaticExecutions.stats, queryFn: api.getAutomaticExecutionStats, enabled: canRead, refetchInterval: 15000 })
  const listQuery = useQuery({ queryKey: qk.automaticExecutions.list(params), queryFn: () => api.listAutomaticExecutions(params), enabled: canRead, placeholderData: keepPreviousData })

  if (permsLoading) return <div className="p-6"><Skeleton className="h-96 w-full" /></div>
  if (!canRead) return <div className="p-10 text-center text-muted-foreground">Non sei autorizzato a visualizzare i runbook automatici.</div>

  const stats = statsQuery.data
  const inQueue = (stats?.byStatus['PENDING_DISPATCH'] ?? 0) + (stats?.byStatus['QUEUED'] ?? 0)
  const rows = listQuery.data?.data ?? []
  const totalPages = listQuery.data?.totalPages ?? 1
  const total = listQuery.data?.total ?? 0
  const resetPageAnd = (fn: (v: string) => void) => (v: string) => { setPage(1); fn(v) }
  const activeFilters = [status, outcome, reviewStatus, triggerKind].filter((v) => v !== ALL).length

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-card">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Runbook automatici</h1>
            <p className="text-sm text-muted-foreground">Esecuzioni automatiche dei runbook sugli allarmi · {total} totali</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              <Play className="mr-1 h-4 w-4" /> Nuova esecuzione
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => { void statsQuery.refetch(); void listQuery.refetch() }}>
            <RotateCw className={`mr-1 h-4 w-4 ${listQuery.isFetching ? 'animate-spin' : ''}`} /> Aggiorna
          </Button>
        </div>
      </div>

      <GlobalOverrideBanner modeOverride={stats?.modeOverride ?? null} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="In coda" value={inQueue} icon={Inbox} accent="border-l-amber-400" />
        <StatCard label="In esecuzione" value={stats?.byStatus['RUNNING']} icon={Loader2} accent="border-l-sky-500" />
        <StatCard label="Da revisionare" value={stats?.pendingReview} icon={ListChecks} accent="border-l-amber-500" attention />
        <StatCard label="In DLQ / retry" value={stats?.inDlq} icon={AlertTriangle} accent="border-l-orange-500" attention />
        <StatCard label="Completate" value={stats?.byStatus['SUCCEEDED']} icon={CheckCircle2} accent="border-l-emerald-500" />
        <StatCard label="Fallite" value={stats?.byStatus['FAILED']} icon={XCircle} accent="border-l-rose-500" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect label="Stato" value={status} onChange={resetPageAnd(setStatus)} options={STATUS_OPTIONS} />
        <FilterSelect label="Esito" value={outcome} onChange={resetPageAnd(setOutcome)} options={OUTCOME_OPTIONS} />
        <FilterSelect label="Revisione" value={reviewStatus} onChange={resetPageAnd(setReviewStatus)} options={REVIEW_OPTIONS} />
        <FilterSelect label="Trigger" value={triggerKind} onChange={resetPageAnd(setTriggerKind)} options={TRIGGER_OPTIONS} />
        {activeFilters > 0 && (
          <Button variant="ghost" size="sm" onClick={() => { setPage(1); setStatus(ALL); setOutcome(ALL); setReviewStatus(ALL); setTriggerKind(ALL) }}>
            Azzera filtri ({activeFilters})
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[220px]">Stato</TableHead>
              <TableHead>Esito</TableHead>
              <TableHead>Allarme</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Runbook</TableHead>
              <TableHead>Revisione</TableHead>
              <TableHead className="text-right">Tentativi</TableHead>
              <TableHead className="text-right">Creata</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-7 w-full" /></TableCell></TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">Nessuna esecuzione corrisponde ai filtri.</TableCell></TableRow>
            ) : (
              rows.map((e, i) => (
                <TableRow
                  key={e.id}
                  className={`cursor-pointer border-l-2 animate-in fade-in-0 slide-in-from-bottom-1 ${STATUS_ACCENT[e.status].bar}`}
                  style={{ animationDelay: `${Math.min(i, 12) * 18}ms`, animationFillMode: 'backwards' }}
                  onClick={() => setSelectedId(e.id)}
                >
                  <TableCell><StatusBadge status={e.status} /></TableCell>
                  <TableCell><OutcomeBadge outcome={e.outcome} /></TableCell>
                  <TableCell className="max-w-[200px] truncate font-mono text-xs" title={e.alarmId ?? ''}>{e.alarmId ?? '—'}</TableCell>
                  <TableCell className="text-sm">{TRIGGER_LABELS[e.triggerKind]}</TableCell>
                  <TableCell className="max-w-[160px] truncate text-sm" title={e.runbookKey ?? ''}>{e.runbookKey ?? '—'}</TableCell>
                  <TableCell><ReviewBadge reviewStatus={e.reviewStatus} /></TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{e.totalWorkerAttempts}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground" title={new Date(e.createdAt).toLocaleString('it-IT')}>{relTime(e.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-3">
        <span className="text-sm text-muted-foreground">Pagina {page} di {totalPages}</span>
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      <ExecutionDetailPanel executionId={selectedId} canWrite={canWrite} globalModeOverride={stats?.modeOverride ?? null} onClose={() => setSelectedId(null)} />

      <ExecuteRunbookPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onLaunched={(id) => setSelectedId(id)}
      />
    </div>
  )
}
