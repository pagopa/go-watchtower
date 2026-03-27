'use client'

import { useState, useMemo } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import {
  Loader2, AlertTriangle, Unlink,
  Clock, ChevronRight, ChevronDown, Lock, User, Calendar, Hash,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { api, type AlarmEvent, type AlarmAnalysis } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { invalidate } from '@/lib/query-invalidation'
import { usePermissions } from '@/hooks/use-permissions'
import { ANALYSIS_STATUS_LABELS } from '@go-watchtower/shared'
import type { AnalysisStatus } from '@go-watchtower/shared'
import { STATUS_ICONS } from '../../analyses/_helpers/cell-renderers'
import {
  ANALYSIS_STATUS_VARIANTS,
  formatDateTimeRome,
} from '../../analyses/_lib/constants'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BulkUnlinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedEvents: AlarmEvent[]
  onCompleted: () => void
}

interface AnalysisGroup {
  analysisId: string
  productId: string
  events: AlarmEvent[]
}

interface GroupAction {
  decrementOccurrences: boolean
  deleteAnalysis: boolean
}

// ─── Analysis row (list-style) ────────────────────────────────────────────────

function AnalysisRow({
  analysis,
  group,
  action,
  canDecrement,
  canDelete,
  isLocked,
  lockDays,
  onUpdateAction,
}: {
  analysis: AlarmAnalysis
  group: AnalysisGroup
  action: GroupAction
  canDecrement: boolean
  canDelete: boolean
  isLocked: boolean
  lockDays: number | null
  onUpdateAction: (patch: Partial<GroupAction>) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const remainingOcc = analysis.occurrences - group.events.length
  const wouldReachZero = remainingOcc <= 0

  const { Icon: StatusIcon, className: statusCls } = STATUS_ICONS[analysis.status as AnalysisStatus]

  return (
    <div className="border-b border-border/30 last:border-b-0">
      {/* ── Main row ────────────────────────────────────────────── */}
      <div className="flex items-center gap-0">
        {/* Delete checkbox column */}
        <div className="w-10 shrink-0 flex items-center justify-center self-stretch">
          {canDelete ? (
            <input
              type="checkbox"
              aria-label={`Elimina analisi ${analysis.alarm.name}`}
              className="h-4 w-4 rounded border-border accent-destructive cursor-pointer"
              checked={action.deleteAnalysis}
              onChange={(e) => onUpdateAction({ deleteAnalysis: e.target.checked })}
            />
          ) : wouldReachZero ? (
            <span title="Non hai i permessi per eliminare">
              <Lock className="h-3 w-3 text-muted-foreground/25" />
            </span>
          ) : null}
        </div>

        {/* Analysis info — clickable to expand events */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center gap-3 py-3 pr-4 text-left group min-w-0"
        >
          {/* Status icon */}
          <StatusIcon className={cn('h-3.5 w-3.5 shrink-0', statusCls)} />

          {/* Name + meta */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-tight truncate group-hover:text-foreground transition-colors">
              {analysis.alarm.name}
            </p>
            <div className="flex items-center gap-0 mt-0.5 text-[11px] text-muted-foreground leading-tight">
              <Calendar className="h-3 w-3 mr-1 shrink-0 opacity-40" />
              <span className="font-mono tabular-nums">{formatDateTimeRome(analysis.analysisDate)}</span>
              <span className="mx-1.5 opacity-25">|</span>
              <User className="h-3 w-3 mr-1 shrink-0 opacity-40" />
              <span className="truncate">{analysis.operator.name}</span>
              <span className="mx-1.5 opacity-25">|</span>
              <Hash className="h-3 w-3 mr-0.5 shrink-0 opacity-40" />
              <span className="font-mono tabular-nums">{analysis.occurrences} occ.</span>
            </div>
          </div>

          {/* Status badge */}
          <Badge
            variant={ANALYSIS_STATUS_VARIANTS[analysis.status as AnalysisStatus]}
            className="shrink-0 text-[9px] px-1.5 py-0 leading-relaxed"
          >
            {ANALYSIS_STATUS_LABELS[analysis.status as AnalysisStatus]}
          </Badge>

          {/* Events count + expand chevron */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground">
              {group.events.length}
            </span>
            <ChevronDown className={cn(
              'h-3.5 w-3.5 text-muted-foreground/40 transition-transform duration-150',
              expanded && 'rotate-180',
            )} />
          </div>
        </button>
      </div>

      {/* ── Expanded: events + options ──────────────────────────── */}
      {expanded && (
        <div className="bg-muted/10">
          {/* Events sub-list */}
          <div className="border-t border-border/20 px-4 py-2 ml-10">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-medium mb-1.5">
              Eventi da scollegare
            </p>
            <div className="space-y-0.5">
              {group.events.map((event) => (
                <div key={event.id} className="flex items-center gap-2.5 py-1">
                  <Clock className="h-3 w-3 shrink-0 text-muted-foreground/30" />
                  <span className="truncate text-xs text-foreground/80">{event.name}</span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatDateTimeRome(event.firedAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="border-t border-border/20 px-4 py-3 ml-10 space-y-2.5">
            {/* Lock warning */}
            {isLocked && (
              <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                <span>Analisi bloccata (oltre {lockDays} giorni). Non modificabile.</span>
              </div>
            )}

            {/* Decrement toggle */}
            {canDecrement && (
              <label
                htmlFor={`decrement-${group.analysisId}`}
                className={cn(
                  'flex items-start gap-3 rounded-lg border bg-background px-4 py-3 transition-all duration-150',
                  action.decrementOccurrences
                    ? 'cursor-pointer border-primary/25 shadow-[inset_3px_0_0_hsl(var(--primary)/0.4)]'
                    : 'cursor-pointer border-border/50 hover:border-border',
                )}
              >
                <Switch
                  id={`decrement-${group.analysisId}`}
                  checked={action.decrementOccurrences}
                  onCheckedChange={(checked) => onUpdateAction({ decrementOccurrences: checked })}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">Decrementa occorrenze</p>
                  <p className="text-[12px] text-muted-foreground/60 mt-1 leading-relaxed">
                    {action.decrementOccurrences
                      ? "Il contatore verrà aggiornato dopo lo scollegamento."
                      : "Le occorrenze rimarranno invariate."}
                  </p>
                  {action.decrementOccurrences && (
                    <div className="flex items-center gap-2 mt-2 text-xs">
                      <span className="font-mono tabular-nums text-muted-foreground">{analysis.occurrences}</span>
                      <ChevronRight className="h-3 w-3 text-primary/50" />
                      <span className="font-mono tabular-nums font-semibold">{remainingOcc}</span>
                    </div>
                  )}
                </div>
              </label>
            )}

            {/* Zero-occurrences warning */}
            {wouldReachZero && (
              <div className="rounded-md border border-amber-300/60 bg-amber-50/60 px-3 py-2.5 dark:border-amber-800/30 dark:bg-amber-950/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <p className="text-[12px] text-amber-700/80 dark:text-amber-400/70 leading-relaxed">
                    Scollegando {group.events.length === 1 ? "l'evento" : `i ${group.events.length} eventi`} le
                    occorrenze scenderebbero a 0.
                    {canDelete
                      ? ' Seleziona la checkbox per eliminare l\'analisi.'
                      : ' L\'analisi rimarrà senza eventi collegati.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border/20">
          <Skeleton className="h-4 w-4 rounded shrink-0" />
          <Skeleton className="h-3.5 w-3.5 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-4 w-14 rounded-full" />
        </div>
      ))}
    </div>
  )
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

export function BulkUnlinkDialog({
  open, onOpenChange, selectedEvents, onCompleted,
}: BulkUnlinkDialogProps) {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const { canFor, getScope } = usePermissions()
  const currentUserId = session?.user?.id

  const [actions, setActions] = useState<Map<string, GroupAction>>(new Map())

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) setActions(new Map())
    onOpenChange(isOpen)
  }

  // ── Group events by analysisId ──────────────────────────────────────────

  const analysisGroups = useMemo<AnalysisGroup[]>(() => {
    const map = new Map<string, AnalysisGroup>()
    for (const event of selectedEvents) {
      if (!event.analysisId) continue
      const existing = map.get(event.analysisId)
      if (existing) {
        existing.events.push(event)
      } else {
        map.set(event.analysisId, {
          analysisId: event.analysisId,
          productId: event.product.id,
          events: [event],
        })
      }
    }
    return Array.from(map.values())
  }, [selectedEvents])

  // ── Fetch each analysis ─────────────────────────────────────────────────

  const analysisQueries = useQueries({
    queries: open
      ? analysisGroups.map((g) => ({
          queryKey: qk.analyses.detail(g.productId, g.analysisId),
          queryFn: () => api.getAnalysis(g.productId, g.analysisId),
          staleTime: 30_000,
        }))
      : [],
  })

  const isLoading = analysisQueries.some((q) => q.isLoading)

  const analysisMap = useMemo(() => {
    const map = new Map<string, AlarmAnalysis>()
    for (const q of analysisQueries) {
      if (q.data) map.set(q.data.id, q.data)
    }
    return map
  }, [analysisQueries])

  // ── Fetch lock-days policy ──────────────────────────────────────────────

  const { data: policy } = useQuery({
    queryKey: qk.analyses.policy,
    queryFn: () => api.getAnalysisPolicy(),
    staleTime: 5 * 60 * 1000,
  })
  const lockDays = policy?.editLockDays ?? null

  // ── Per-group permissions ───────────────────────────────────────────────

  const [mountTime] = useState(Date.now)

  const permissionsMap = useMemo(() => {
    const map = new Map<string, { canEdit: boolean; canDelete: boolean; isLocked: boolean }>()
    for (const [id, analysis] of analysisMap) {
      const isLocked = (() => {
        if (lockDays === null) return false
        if (getScope('ALARM_ANALYSIS', 'write') !== 'OWN') return false
        if (analysis.createdById !== currentUserId) return false
        const daysSince = Math.floor((mountTime - new Date(analysis.createdAt).getTime()) / 86_400_000)
        return daysSince >= lockDays
      })()

      const canEdit = !isLocked && canFor('ALARM_ANALYSIS', 'write', analysis.createdById, currentUserId)
      const canDelete = !isLocked && canFor('ALARM_ANALYSIS', 'delete', analysis.createdById, currentUserId)
      map.set(id, { canEdit, canDelete, isLocked })
    }
    return map
  }, [analysisMap, lockDays, getScope, canFor, currentUserId, mountTime])

  // ── Helpers for per-group action state ──────────────────────────────────

  const getAction = (analysisId: string): GroupAction =>
    actions.get(analysisId) ?? { decrementOccurrences: true, deleteAnalysis: false }

  const updateAction = (analysisId: string, patch: Partial<GroupAction>) => {
    setActions((prev) => {
      const next = new Map(prev)
      const current = next.get(analysisId) ?? { decrementOccurrences: true, deleteAnalysis: false }
      next.set(analysisId, { ...current, ...patch })
      return next
    })
  }

  // ── Mutation ────────────────────────────────────────────────────────────

  const bulkUnlinkMutation = useMutation({
    mutationFn: async () => {
      for (const group of analysisGroups) {
        for (const event of group.events) {
          await api.linkAlarmEventAnalysis(event.id, null)
        }
      }
      for (const group of analysisGroups) {
        const analysis = analysisMap.get(group.analysisId)
        if (!analysis) continue
        const action = getAction(group.analysisId)
        const perms = permissionsMap.get(group.analysisId)

        if (action.deleteAnalysis && perms?.canDelete) {
          await api.deleteAnalysis(group.productId, group.analysisId)
        } else if (action.decrementOccurrences && perms?.canEdit) {
          const newOcc = analysis.occurrences - group.events.length
          if (newOcc > 0 && newOcc !== analysis.occurrences) {
            await api.updateAnalysis(group.productId, group.analysisId, {
              occurrences: newOcc,
            })
          }
        }
      }
    },
    onSuccess: () => {
      invalidate(queryClient, 'alarmEvents', 'analyses')
      toast.success(`${selectedEvents.length} eventi scollegati`)
      onCompleted()
      handleOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante lo scollegamento')
    },
  })

  // ── Derived counts ────────────────────────────────────────────────────

  const totalEvents = selectedEvents.length
  const totalAnalyses = analysisGroups.length
  const deletingCount = analysisGroups.filter(
    (g) => getAction(g.analysisId).deleteAnalysis && permissionsMap.get(g.analysisId)?.canDelete,
  ).length

  // Some analyses have zero-remaining and are deletable — show column header hint
  const hasDeletableGroups = analysisGroups.some((g) => {
    const analysis = analysisMap.get(g.analysisId)
    if (!analysis) return false
    const perms = permissionsMap.get(g.analysisId)
    return (analysis.occurrences - g.events.length) <= 0 && !!perms?.canDelete
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[calc(100vh-8rem)] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogTitle className="sr-only">Scollega eventi da analisi</DialogTitle>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="shrink-0 px-6 pt-6 pb-4 border-b bg-background">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Unlink className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold leading-tight">
                Scollega eventi da analisi
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {totalEvents} {totalEvents === 1 ? 'evento' : 'eventi'} da{' '}
                {totalAnalyses} {totalAnalyses === 1 ? 'analisi' : 'analisi'}
              </p>
            </div>
          </div>
        </div>

        {/* ── List header ────────────────────────────────────────── */}
        {!isLoading && (
          <div className="shrink-0 flex items-center gap-0 border-b bg-muted/15 text-[10px] uppercase tracking-widest text-muted-foreground/50 font-medium">
            <div className="w-10 shrink-0 text-center py-2">
              {hasDeletableGroups && (
                <span title="Seleziona le analisi da eliminare">Elim.</span>
              )}
            </div>
            <div className="flex-1 py-2">Analisi</div>
            <div className="w-16 shrink-0 text-center py-2">Stato</div>
            <div className="w-14 shrink-0 text-center py-2 pr-4">Eventi</div>
          </div>
        )}

        {/* ── List body ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <ListSkeleton count={Math.min(analysisGroups.length, 4)} />
          ) : (
            analysisGroups.map((group) => {
              const analysis = analysisMap.get(group.analysisId)
              if (!analysis) return null

              const perms = permissionsMap.get(group.analysisId)
              const action = getAction(group.analysisId)

              const remainingOcc = analysis.occurrences - group.events.length
              const wouldReachZero = remainingOcc <= 0
              const canDecrement = !wouldReachZero && !!perms?.canEdit
              const canDelete = wouldReachZero && !!perms?.canDelete

              return (
                <AnalysisRow
                  key={group.analysisId}
                  analysis={analysis}
                  group={group}
                  action={action}
                  canDecrement={canDecrement}
                  canDelete={canDelete}
                  isLocked={perms?.isLocked ?? false}
                  lockDays={lockDays}
                  onUpdateAction={(patch) => updateAction(group.analysisId, patch)}
                />
              )
            })
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <div className="shrink-0 border-t bg-muted/10 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground/60">
              {deletingCount > 0 && (
                <span className="text-destructive font-medium">
                  {deletingCount} {deletingCount === 1 ? 'analisi sarà eliminata' : 'analisi saranno eliminate'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={bulkUnlinkMutation.isPending}
              >
                Annulla
              </Button>
              <Button
                size="sm"
                onClick={() => bulkUnlinkMutation.mutate()}
                disabled={bulkUnlinkMutation.isPending || isLoading}
              >
                {bulkUnlinkMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Scollega {totalEvents} {totalEvents === 1 ? 'evento' : 'eventi'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
