'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, ChevronDown, Loader2, RefreshCw, Search, Server, Waypoints, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { api, type AutomaticRunbookCapability } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { catalogHealthMeta, runbookKindLabel } from './labels'

function shortHash(value: string | null | undefined): string {
  if (!value) return '—'
  return value.length > 20 ? `${value.slice(0, 12)}…${value.slice(-6)}` : value
}

const KIND_ICONS: Record<string, typeof Bot> = {
  APIGW: Waypoints,
  LAMBDA: Zap,
  SERVICE: Server,
}

/** Micro-colonna auto-descrittiva: etichetta sopra, valore sotto (come nel tab Canali). */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  )
}

// ─── Azioni con motivazione (dialog condiviso) ───────────────────────────────

type ActionKind = 'exclude' | 'restore' | 'only'

interface PendingAction {
  capability: AutomaticRunbookCapability
  kind: ActionKind
}

const ACTION_COPY: Record<ActionKind, { title: string; description: (name: string) => string; confirm: string }> = {
  exclude: {
    title: 'Escludere questo runbook?',
    description: (name) =>
      `«${name}» non creerà più execution automatiche: viene aggiunta un'esclusione rapida in testa alle regole di scope. Reversibile in ogni momento.`,
    confirm: 'Escludi runbook',
  },
  restore: {
    title: 'Ripristinare le regole di scope?',
    description: (name) =>
      `L'esclusione rapida di «${name}» viene rimossa: torneranno a valere le normali regole di scope.`,
    confirm: 'Rimuovi esclusione',
  },
  only: {
    title: 'Consentire solo questo runbook?',
    description: (name) =>
      `Tutte le regole di scope attuali verranno sostituite da una sola regola che consente esclusivamente «${name}». Le esclusioni rapide vengono rimosse. L'operazione crea una nuova revisione ed è reversibile modificando le regole.`,
    confirm: 'Sostituisci le regole',
  },
}

// ─── Riga runbook ─────────────────────────────────────────────────────────────

function CapabilityRow({
  capability,
  canWrite,
  expanded,
  onToggleExpand,
  onAction,
}: {
  capability: AutomaticRunbookCapability
  canWrite: boolean
  expanded: boolean
  onToggleExpand: () => void
  onAction: (kind: ActionKind) => void
}) {
  const excluded = capability.globallyExcluded === true
  const Icon = KIND_ICONS[capability.kind] ?? Bot

  return (
    <div className={cn('border-l-4 bg-card transition-colors hover:bg-muted/30', excluded ? 'border-l-rose-500 opacity-80' : 'border-l-emerald-500')}>
      <div className="grid items-center gap-x-6 gap-y-3 px-4 py-3 lg:grid-cols-[minmax(260px,1.6fr)_minmax(90px,0.5fr)_minmax(150px,1fr)_minmax(110px,0.6fr)_minmax(150px,0.9fr)_auto]">
        {/* Identità: nome + key */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/50" title={runbookKindLabel(capability.kind)}>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium leading-tight">{capability.name || capability.key}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{capability.key}</p>
          </div>
        </div>

        <Field label="Versione">
          <span className="font-mono text-xs">{capability.version}</span>
        </Field>

        <Field label="Categorie">
          {capability.categories.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {capability.categories.slice(0, 2).map((category) => (
                <Badge key={category} variant="secondary" className="font-normal">{category}</Badge>
              ))}
              {capability.categories.length > 2 && (
                <Badge variant="outline" className="font-normal text-muted-foreground" title={capability.categories.slice(2).join(', ')}>
                  +{capability.categories.length - 2}
                </Badge>
              )}
            </span>
          )}
        </Field>

        <Field label="Allarmi">
          <span className="text-sm" title={capability.alarmNames.join(', ')}>
            {capability.alarmNames.length === 0 ? '—' : capability.alarmNames.length === 1 ? '1 allarme' : `${capability.alarmNames.length} allarmi`}
          </span>
        </Field>

        <Field label="Automazione">
          <span className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', excluded ? 'bg-rose-500' : 'bg-emerald-500')} />
            <span className="text-sm font-medium">{excluded ? 'Escluso' : 'Regole di scope'}</span>
          </span>
        </Field>

        {/* Azioni */}
        <div className="flex items-center justify-end gap-1">
          {canWrite && (
            <>
              <Button variant="ghost" size="sm" onClick={() => onAction('only')}>
                Solo questo
              </Button>
              {excluded ? (
                <Button variant="outline" size="sm" onClick={() => onAction('restore')}>
                  Ripristina
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => onAction('exclude')}>
                  Escludi
                </Button>
              )}
            </>
          )}
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onToggleExpand} aria-expanded={expanded} aria-label={expanded ? 'Comprimi dettagli' : 'Mostra dettagli'}>
            <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
          </Button>
        </div>
      </div>

      {/* Dettagli espansi: descrizione, allarmi, riferimenti tecnici */}
      {expanded && (
        <div className="space-y-3 border-t bg-muted/20 px-4 py-3">
          {capability.description && <p className="max-w-3xl text-sm text-muted-foreground">{capability.description}</p>}
          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <Field label="Allarmi supportati">
              {capability.alarmNames.length === 0 ? (
                <span className="text-muted-foreground">Nessuno</span>
              ) : (
                <span className="flex flex-wrap gap-1">
                  {capability.alarmNames.map((alarmName) => (
                    <Badge key={alarmName} variant="outline" className="font-mono text-[11px] font-normal">{alarmName}</Badge>
                  ))}
                </span>
              )}
            </Field>
            <div className="flex gap-6">
              {capability.ownerTeam && (
                <Field label="Team">
                  <span className="text-sm">{capability.ownerTeam}</span>
                </Field>
              )}
              <Field label="Digest definizione">
                <span className="font-mono text-xs" title={capability.definitionDigest}>{shortHash(capability.definitionDigest)}</span>
              </Field>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab catalogo ─────────────────────────────────────────────────────────────

export function CatalogTab({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [note, setNote] = useState('')

  const catalogQuery = useQuery({ queryKey: qk.automaticRunbookCatalog.list, queryFn: api.getAutomaticRunbookCatalog })
  const statusQuery = useQuery({ queryKey: qk.automaticRunbookCatalog.status, queryFn: api.getAutomaticRunbookCatalogStatus })
  const controlQuery = useQuery({ queryKey: qk.slackIngestor.control, queryFn: api.getSlackIngestorControl })

  const refresh = useMutation({
    mutationFn: api.refreshAutomaticRunbookCatalog,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.automaticRunbookCatalog.root })
      toast.success('Sincronizzazione catalogo completata')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const actionMutation = useMutation({
    mutationFn: ({ capability, kind }: PendingAction): Promise<unknown> => {
      const payload = { expectedRevision: controlQuery.data?.control.revision ?? 0, changeNote: note.trim() }
      if (kind === 'exclude') return api.excludeAutomaticRunbook(capability.key, payload)
      if (kind === 'restore') return api.removeAutomaticRunbookExclusion(capability.key, payload)
      return api.applyOnlyAutomaticRunbookPreset(capability.key, { ...payload, confirm: true })
    },
    onSuccess: (_result, action) => {
      void queryClient.invalidateQueries({ queryKey: qk.slackIngestor.control })
      void queryClient.invalidateQueries({ queryKey: qk.automaticRunbookCatalog.root })
      void queryClient.invalidateQueries({ queryKey: qk.slackIngestor.history })
      toast.success(
        action.kind === 'exclude'
          ? 'Runbook escluso dalle execution automatiche'
          : action.kind === 'restore'
            ? 'Esclusione rimossa'
            : 'Scope limitato al solo runbook selezionato'
      )
      setPending(null)
      setNote('')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const isLocalCatalog = statusQuery.data?.sourceVersionId?.startsWith('local:') ?? false
  const health = catalogHealthMeta(statusQuery.data?.health)
  const capabilities = useMemo(() => catalogQuery.data?.data ?? [], [catalogQuery.data])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return capabilities
    return capabilities.filter((entry) =>
      [entry.key, entry.name, entry.kind, runbookKindLabel(entry.kind), ...entry.categories, ...entry.alarmNames].some(
        (value) => value.toLowerCase().includes(needle)
      )
    )
  }, [capabilities, search])

  // Raggruppa per tipo (API Gateway, Lambda, Servizio), tipi sconosciuti in coda
  const byKind = useMemo(() => {
    const groups = new Map<string, AutomaticRunbookCapability[]>()
    for (const capability of filtered) {
      groups.set(capability.kind, [...(groups.get(capability.kind) ?? []), capability])
    }
    return [...groups.entries()].sort(([a], [b]) => runbookKindLabel(a).localeCompare(runbookKindLabel(b)))
  }, [filtered])

  const excludedCount = capabilities.filter((capability) => capability.globallyExcluded).length
  const copy = pending ? ACTION_COPY[pending.kind] : null

  return (
    <div className="space-y-5">
      {/* Stato del catalogo: strip compatta */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center">
          <div className="flex flex-1 flex-wrap items-center gap-x-8 gap-y-3">
            <Field label="Stato catalogo">
              <Badge variant={health.variant}>{health.label}</Badge>
            </Field>
            <Field label="Sorgente">
              <Badge variant="outline">{isLocalCatalog ? 'Locale (CLI)' : statusQuery.data?.sourceVersionId ? 'S3' : '—'}</Badge>
            </Field>
            <Field label="Revisione">
              <span className="font-mono text-xs" title={catalogQuery.data?.revision ?? ''}>{shortHash(catalogQuery.data?.revision)}</span>
            </Field>
            <Field label="Worker">
              <span className="font-mono text-xs">{shortHash(catalogQuery.data?.workerArtifactRevision)}</span>
            </Field>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!canWrite || refresh.isPending || isLocalCatalog}
            title={isLocalCatalog ? 'Rigenera e importa il catalogo tramite i comandi CLI locali.' : undefined}
            onClick={() => refresh.mutate()}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', refresh.isPending && 'animate-spin')} />
            {isLocalCatalog ? 'Importato tramite CLI' : 'Sincronizza da S3'}
          </Button>
        </CardContent>
      </Card>

      {/* Ricerca + sintesi */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca per nome, tipo, categoria o allarme"
          />
        </div>
        {!catalogQuery.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              <span className="font-mono font-semibold text-foreground">{capabilities.length}</span> runbook
            </span>
            {excludedCount > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  <span className="font-mono font-semibold text-foreground">{excludedCount}</span> esclusi
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {catalogQuery.isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((index) => <Skeleton key={index} className="h-40 w-full rounded-lg" />)}
        </div>
      ) : byKind.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-14 text-center text-sm text-muted-foreground">
          {search ? 'Nessun runbook corrisponde al filtro.' : 'Il catalogo è vuoto: sincronizza da S3 o importa tramite CLI.'}
        </div>
      ) : (
        byKind.map(([kind, group]) => (
          <section key={kind} className="space-y-2">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide">{runbookKindLabel(kind)}</h2>
              <span className="text-xs text-muted-foreground">
                {group.length === 1 ? '1 runbook' : `${group.length} runbook`}
              </span>
            </div>
            <div className="divide-y overflow-hidden rounded-lg border">
              {group.map((capability) => (
                <CapabilityRow
                  key={capability.key}
                  capability={capability}
                  canWrite={canWrite && Boolean(controlQuery.data)}
                  expanded={expandedKey === capability.key}
                  onToggleExpand={() => setExpandedKey(expandedKey === capability.key ? null : capability.key)}
                  onAction={(kind) => {
                    setNote('')
                    setPending({ capability, kind })
                  }}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {/* Dialog di conferma con motivazione (obbligatoria per audit) */}
      <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open) { setPending(null); setNote('') } }}>
        <AlertDialogContent>
          {pending && copy && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{copy.title}</AlertDialogTitle>
                <AlertDialogDescription>
                  {copy.description(pending.capability.name || pending.capability.key)}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="action-note">
                  Motivazione <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="action-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Registrata nell'audit log insieme alla nuova revisione"
                  autoFocus
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction
                  disabled={!note.trim() || actionMutation.isPending}
                  onClick={(event) => {
                    event.preventDefault()
                    actionMutation.mutate(pending)
                  }}
                >
                  {actionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {copy.confirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
