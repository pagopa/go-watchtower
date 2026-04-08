'use client'

import { useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, Search, AlertCircle,
  Bell, Clock, User, Hash, Calendar, Activity, Siren,
  FileText, Tag, MousePointerClick, ChevronRight, Link2,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'
import { api, type AlarmEvent, type AlarmAnalysis } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { invalidate } from '@/lib/query-invalidation'
import { ANALYSIS_STATUS_LABELS, ANALYSIS_TYPE_LABELS, AnalysisStatuses } from '@go-watchtower/shared'
import {
  STATUS_ICONS,
  TYPE_ICONS,
} from '../../analyses/_helpers/cell-renderers'
import {
  ANALYSIS_STATUS_VARIANTS,
  formatDateTimeRome,
  formatDateTimeUTC,
} from '../../analyses/_lib/constants'

interface BulkAssociateAnalysisDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedEvents: AlarmEvent[]
  onCompleted: () => void
}

// ─── List item (reuses pattern from associate-analysis-dialog) ──────────────

function AnalysisListItem({
  analysis,
  selected,
  onSelect,
}: {
  analysis: AlarmAnalysis
  selected: boolean
  onSelect: () => void
}) {
  const { Icon: StatusIcon, className: statusClassName } = STATUS_ICONS[analysis.status]

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-all duration-150',
        selected
          ? 'bg-primary/[0.07] shadow-[inset_3px_0_0_hsl(var(--primary))]'
          : 'hover:bg-muted/60'
      )}
    >
      <StatusIcon className={cn('h-3.5 w-3.5 shrink-0', statusClassName)} />
      <div className="min-w-0 flex-1">
        <p className={cn(
          'truncate text-sm leading-tight',
          selected ? 'font-semibold' : 'font-medium text-foreground/80 group-hover:text-foreground'
        )}>
          {analysis.alarm.name}
        </p>
        <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
          {formatDateTimeRome(analysis.analysisDate)}
          <span className="mx-1 opacity-30">|</span>
          {analysis.operator.name}
          <span className="mx-1 opacity-30">|</span>
          <span className="tabular-nums">{analysis.occurrences}</span> occ.
        </p>
      </div>
      <Badge
        variant={ANALYSIS_STATUS_VARIANTS[analysis.status]}
        className={cn(
          'shrink-0 text-[9px] px-1.5 py-0 leading-relaxed transition-opacity duration-150',
          !selected && 'opacity-50 group-hover:opacity-100'
        )}
      >
        {ANALYSIS_STATUS_LABELS[analysis.status]}
      </Badge>
    </button>
  )
}

function AnalysisListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
          <Skeleton className="h-3.5 w-3.5 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Detail field ────────────────────────────────────────────────────────────

function DetailField({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/35" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 leading-none mb-0.5 font-medium">{label}</p>
        <div className="text-sm leading-tight">{children}</div>
      </div>
    </div>
  )
}

// ─── Option toggle ───────────────────────────────────────────────────────────

function OptionToggle({
  id,
  checked,
  onCheckedChange,
  disabled,
  title,
  description,
  children,
}: {
  id: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-start gap-3 rounded-lg border bg-background px-4 py-3 transition-all duration-150',
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : checked
            ? 'cursor-pointer border-primary/25 shadow-[inset_3px_0_0_hsl(var(--primary)/0.4)]'
            : 'cursor-pointer border-border/50 hover:border-border',
      )}
    >
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{title}</p>
        <p className="text-[12px] text-muted-foreground/60 mt-1 leading-relaxed">{description}</p>
        {children}
      </div>
    </label>
  )
}

// ─── Main dialog ─────────────────────────────────────────────────────────────

export function BulkAssociateAnalysisDialog({
  open,
  onOpenChange,
  selectedEvents,
  onCompleted,
}: BulkAssociateAnalysisDialogProps) {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const { getScope } = usePermissions()
  const currentUserId = session?.user?.id
  const writeScope = getScope('ALARM_ANALYSIS', 'write')
  const ownOnly = writeScope === 'OWN'

  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null)
  const [incrementOccurrences, setIncrementOccurrences] = useState(true)
  const [updateLastAlarmAt, setUpdateLastAlarmAt] = useState(true)
  const [reopenAnalysis, setReopenAnalysis] = useState(true)

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedAnalysisId(null)
      setIncrementOccurrences(true)
      setUpdateLastAlarmAt(true)
      setReopenAnalysis(true)
    }
    onOpenChange(isOpen)
  }

  // ── Derived from selection ──────────────────────────────────────────────

  // All selected events share the same product, environment, and alarm name
  // (enforced by the toolbar eligibility check), so we use the first event.
  const representative = selectedEvents[0] ?? null

  const newestFiredAt = useMemo(() => {
    if (selectedEvents.length === 0) return null
    return selectedEvents.reduce(
      (max, e) => (e.firedAt > max ? e.firedAt : max),
      selectedEvents[0].firedAt,
    )
  }, [selectedEvents])

  const oldestFiredAt = useMemo(() => {
    if (selectedEvents.length === 0) return null
    return selectedEvents.reduce(
      (min, e) => (e.firedAt < min ? e.firedAt : min),
      selectedEvents[0].firedAt,
    )
  }, [selectedEvents])

  // ── Query ────────────────────────────────────────────────────────────────

  const analysesQuery = useQuery({
    queryKey: qk.analyses.forLink(
      representative?.product.id ?? null,
      representative?.environment.id ?? null,
      representative?.alarmId ?? null,
      ownOnly ? currentUserId ?? null : null,
    ),
    staleTime: 0,
    queryFn: () => {
      const e = representative!
      const oneMonthAgo = new Date()
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
      return api.getAllAnalyses({
        productId: e.product.id,
        environmentId: e.environment.id,
        ...(e.alarmId && { alarmId: e.alarmId }),
        ...(ownOnly && currentUserId && { createdById: currentUserId }),
        dateFrom: oneMonthAgo.toISOString(),
        pageSize: 50,
        sortBy: 'analysisDate',
        sortOrder: 'desc',
      })
    },
    enabled: open && !!representative,
  })

  const analysesData = analysesQuery.data?.data
  const analyses = analysesData ?? []

  const selectedAnalysis = useMemo(() => {
    if (!selectedAnalysisId) return null
    return (analysesData ?? []).find((a) => a.id === selectedAnalysisId) ?? null
  }, [selectedAnalysisId, analysesData])

  const eventIsNewer = !!(
    newestFiredAt && selectedAnalysis &&
    new Date(newestFiredAt).getTime() > new Date(selectedAnalysis.lastAlarmAt).getTime()
  )

  const isCompleted = selectedAnalysis?.status === AnalysisStatuses.COMPLETED
  const eventCount = selectedEvents.length

  // ── Mutation ─────────────────────────────────────────────────────────────

  const associateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAnalysisId || selectedEvents.length === 0) throw new Error('Missing data')

      for (let i = 0; i < selectedEvents.length; i++) {
        const event = selectedEvents[i]
        const isFirst = i === 0

        const analysisUpdates: {
          incrementOccurrences?: boolean
          lastAlarmAt?: string
          reopenAnalysis?: boolean
        } = {}

        if (incrementOccurrences) {
          analysisUpdates.incrementOccurrences = true
        }
        // Only send lastAlarmAt and reopenAnalysis once (on the first event)
        // to avoid redundant updates. incrementOccurrences is sent for each
        // event since each call increments by 1.
        if (isFirst && updateLastAlarmAt && eventIsNewer && newestFiredAt) {
          analysisUpdates.lastAlarmAt = newestFiredAt
        }
        if (isFirst && reopenAnalysis && isCompleted) {
          analysisUpdates.reopenAnalysis = true
        }

        const hasUpdates = Object.keys(analysisUpdates).length > 0
        await api.linkAlarmEventAnalysis(
          event.id,
          selectedAnalysisId,
          hasUpdates ? analysisUpdates : undefined,
        )
      }
    },
    onSuccess: () => {
      invalidate(queryClient, 'alarmEvents', 'analyses')
      toast.success(`${eventCount} eventi associati all'analisi`)
      onCompleted()
      handleOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante l\'associazione')
    },
  })

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[1400px] max-h-[calc(100vh-16rem)] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogTitle className="sr-only">Associa eventi ad analisi esistente</DialogTitle>

        <div className="flex flex-1 min-h-0" style={{ minHeight: 'min(680px, calc(100vh - 18rem))' }}>

          {/* ─── Left: Selected events ──────────────────────────── */}
          <div className="w-[300px] shrink-0 border-r flex flex-col min-h-0">
            <div className="shrink-0 px-4 py-2.5 border-b bg-muted/15">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Siren className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Eventi selezionati
                  </h3>
                </div>
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground">
                  {eventCount}
                </span>
              </div>
            </div>

            {representative && (
              <div className="shrink-0 border-b bg-muted/5 px-4 py-2.5">
                <p className="text-sm font-semibold leading-snug break-words">{representative.name}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {representative.product.name}
                  <span className="mx-1 opacity-30">·</span>
                  {representative.environment.name}
                </p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-2 py-2">
              <div className="space-y-0.5">
                {selectedEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5"
                  >
                    <Clock className="h-3 w-3 shrink-0 text-muted-foreground/30" />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatDateTimeRome(event.firedAt)}
                      </p>
                    </div>
                    {event.analysisId && (
                      <Badge variant="outline" className="shrink-0 text-[9px] px-1.5 py-0">
                        già collegato
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {oldestFiredAt && newestFiredAt && (
              <div className="shrink-0 border-t bg-muted/10 px-4 py-2 text-[11px] text-muted-foreground/60">
                <div className="flex justify-between">
                  <span>Più vecchio</span>
                  <span className="font-mono tabular-nums">{formatDateTimeUTC(oldestFiredAt)} UTC</span>
                </div>
                <div className="flex justify-between mt-0.5">
                  <span>Più recente</span>
                  <span className="font-mono tabular-nums">{formatDateTimeUTC(newestFiredAt)} UTC</span>
                </div>
              </div>
            )}
          </div>

          {/* ─── Center: Analysis list ──────────────────────────── */}
          <div className="w-[380px] shrink-0 border-r flex flex-col min-h-0">
            <div className="shrink-0 px-4 py-2.5 border-b bg-background">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Analisi disponibili
                </h3>
                {analyses.length > 0 && (
                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground">
                    {analyses.length}
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2">
              {analysesQuery.isLoading ? (
                <AnalysisListSkeleton />
              ) : analysesQuery.isError ? (
                <div className="flex flex-col items-center gap-1.5 py-10 text-center px-4">
                  <AlertCircle className="h-5 w-5 text-destructive/50" />
                  <p className="text-xs text-destructive">Errore nel caricamento delle analisi</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => analysesQuery.refetch()}
                  >
                    Riprova
                  </Button>
                </div>
              ) : analyses.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 py-10 text-center px-4">
                  <Search className="h-5 w-5 text-muted-foreground/25" />
                  <p className="text-xs text-muted-foreground">Nessuna analisi trovata</p>
                  <p className="text-[11px] text-muted-foreground/50 leading-relaxed max-w-[240px]">
                    Non ci sono analisi corrispondenti a questo allarme
                    {ownOnly ? ' tra quelle da te create' : ''}.
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {analyses.map((analysis) => (
                    <AnalysisListItem
                      key={analysis.id}
                      analysis={analysis}
                      selected={selectedAnalysisId === analysis.id}
                      onSelect={() =>
                        setSelectedAnalysisId(
                          selectedAnalysisId === analysis.id ? null : analysis.id
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ─── Right: Selected analysis + Options ───────────────── */}
          <div className="flex-1 flex flex-col min-w-0">

            {!selectedAnalysis ? (
              <div className="flex-1 flex items-center justify-center px-6">
                <div className="text-center space-y-2">
                  <MousePointerClick className="mx-auto h-8 w-8 text-muted-foreground/15" />
                  <p className="text-sm text-muted-foreground/35">
                    Seleziona un&apos;analisi dalla lista
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* ── Analysis detail ──────────────────────────────── */}
                <div className="flex-1 px-6 py-5 space-y-4 overflow-y-auto">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="h-4.5 w-4.5 text-primary/50" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Analisi selezionata</h3>
                  </div>

                  {/* Alarm name + status */}
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-lg font-semibold leading-snug break-words">{selectedAnalysis.alarm.name}</p>
                    <Badge variant={ANALYSIS_STATUS_VARIANTS[selectedAnalysis.status]} className="shrink-0 text-xs px-2.5 py-0.5">
                      {ANALYSIS_STATUS_LABELS[selectedAnalysis.status]}
                    </Badge>
                  </div>

                  {/* Detail grid */}
                  <div className="grid grid-cols-3 gap-x-6 gap-y-4 pt-1">
                    <DetailField icon={Siren} label="Tipo">
                      {(() => {
                        const { Icon: TIcon, className: tCls } = TYPE_ICONS[selectedAnalysis.analysisType]
                        return (
                          <div className="flex items-center gap-1.5">
                            <TIcon className={cn('h-3.5 w-3.5', tCls)} />
                            <span className="text-sm">{ANALYSIS_TYPE_LABELS[selectedAnalysis.analysisType]}</span>
                          </div>
                        )
                      })()}
                    </DetailField>

                    <DetailField icon={User} label="Operatore">
                      <span className="text-sm font-medium">{selectedAnalysis.operator.name}</span>
                    </DetailField>

                    <DetailField icon={Calendar} label="Data analisi">
                      <span className="font-mono text-sm tabular-nums">{formatDateTimeRome(selectedAnalysis.analysisDate)}</span>
                    </DetailField>

                    <DetailField icon={Hash} label="Occorrenze">
                      <span className="font-mono text-sm tabular-nums font-semibold">{selectedAnalysis.occurrences}</span>
                    </DetailField>

                    <DetailField icon={Clock} label="Primo allarme">
                      <span className="font-mono text-sm tabular-nums">{formatDateTimeUTC(selectedAnalysis.firstAlarmAt)} UTC</span>
                    </DetailField>

                    <DetailField icon={Clock} label="Ultimo allarme">
                      <span className="font-mono text-sm tabular-nums">{formatDateTimeUTC(selectedAnalysis.lastAlarmAt)} UTC</span>
                    </DetailField>

                    <DetailField icon={Tag} label="Prodotto">
                      <span className="text-sm">{selectedAnalysis.product.name}</span>
                    </DetailField>

                    <DetailField icon={Activity} label="Ambiente">
                      <span className="text-sm">{selectedAnalysis.environment.name}</span>
                    </DetailField>

                    {selectedAnalysis.isOnCall && (
                      <DetailField icon={Bell} label="Reperibilità">
                        <Badge variant="outline" className="text-xs px-2 py-0">On-call</Badge>
                      </DetailField>
                    )}
                  </div>

                  {selectedAnalysis.errorDetails && (
                    <div className="pt-3 border-t border-border/40">
                      <DetailField icon={FileText} label="Dettagli errore">
                        <p className="text-sm text-muted-foreground leading-relaxed break-words">
                          {selectedAnalysis.errorDetails.length > 300
                            ? `${selectedAnalysis.errorDetails.slice(0, 300)}...`
                            : selectedAnalysis.errorDetails}
                        </p>
                      </DetailField>
                    </div>
                  )}
                </div>

                {/* ── Options + Actions ────────────────────────────── */}
                <div className="shrink-0 border-t bg-muted/10 px-5 py-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-muted-foreground/40" />
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      Opzioni associazione
                    </h3>
                  </div>

                  <OptionToggle
                    id="bulk-increment-occurrences"
                    checked={incrementOccurrences}
                    onCheckedChange={setIncrementOccurrences}
                    title="Incrementa occorrenze"
                    description={`Aumenta di ${eventCount} il conteggio delle occorrenze dell'analisi (1 per ciascun evento selezionato).`}
                  >
                    {incrementOccurrences && (
                      <div className="flex items-center gap-2 mt-2 text-xs">
                        <span className="font-mono tabular-nums text-muted-foreground">{selectedAnalysis.occurrences}</span>
                        <ChevronRight className="h-3 w-3 text-primary/50" />
                        <span className="font-mono tabular-nums font-semibold">{selectedAnalysis.occurrences + eventCount}</span>
                      </div>
                    )}
                  </OptionToggle>

                  <OptionToggle
                    id="bulk-update-last-alarm-at"
                    checked={updateLastAlarmAt && eventIsNewer}
                    onCheckedChange={setUpdateLastAlarmAt}
                    disabled={!eventIsNewer}
                    title="Aggiorna data ultimo allarme"
                    description={eventIsNewer
                      ? 'Aggiorna la data dell\'ultimo allarme con la data dell\'evento più recente tra quelli selezionati.'
                      : 'Nessun evento selezionato è più recente dell\'ultimo allarme registrato nell\'analisi.'}
                  >
                    {eventIsNewer && updateLastAlarmAt && newestFiredAt && (
                      <div className="flex items-center gap-2 mt-2 text-xs">
                        <span className="font-mono tabular-nums text-muted-foreground">{formatDateTimeUTC(selectedAnalysis.lastAlarmAt)} UTC</span>
                        <ChevronRight className="h-3 w-3 text-primary/50" />
                        <span className="font-mono tabular-nums font-semibold">{formatDateTimeUTC(newestFiredAt)} UTC</span>
                      </div>
                    )}
                  </OptionToggle>

                  <OptionToggle
                    id="bulk-reopen-analysis"
                    checked={reopenAnalysis && isCompleted}
                    onCheckedChange={setReopenAnalysis}
                    disabled={!isCompleted}
                    title="Riapri analisi"
                    description={isCompleted
                      ? 'L\'analisi è completata. Riportala allo stato "In corso" per segnalare che nuovi allarmi richiedono ulteriore analisi.'
                      : 'L\'analisi non è in stato completato, quindi non è necessario riaprirla.'}
                  >
                    {isCompleted && reopenAnalysis && (
                      <div className="flex items-center gap-2 mt-2 text-xs">
                        <span className="text-muted-foreground">{ANALYSIS_STATUS_LABELS[AnalysisStatuses.COMPLETED]}</span>
                        <ChevronRight className="h-3 w-3 text-primary/50" />
                        <span className="font-semibold">{ANALYSIS_STATUS_LABELS[AnalysisStatuses.IN_PROGRESS]}</span>
                      </div>
                    )}
                  </OptionToggle>

                  {/* Actions */}
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenChange(false)}
                      disabled={associateMutation.isPending}
                    >
                      Annulla
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => associateMutation.mutate()}
                      disabled={!selectedAnalysisId || associateMutation.isPending}
                    >
                      {associateMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Associa {eventCount} eventi
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
