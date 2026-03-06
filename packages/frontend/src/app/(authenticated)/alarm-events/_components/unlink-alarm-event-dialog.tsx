'use client'

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { Loader2, AlertTriangle, Unlink, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { api, type AlarmAnalysis } from '@/lib/api-client'
import { usePermissions } from '@/hooks/use-permissions'

interface UnlinkAlarmEventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The alarm event to unlink */
  eventId: string | null
  eventName: string
  /** The analysis currently linked */
  analysis: AlarmAnalysis | null
  /** Called after successful unlink or delete */
  onCompleted: () => void
}

export function UnlinkAlarmEventDialog({
  open, onOpenChange, eventId, eventName, analysis, onCompleted,
}: UnlinkAlarmEventDialogProps) {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const { canFor, getScope } = usePermissions()
  const currentUserId = session?.user?.id

  // Fetch lock days policy
  const { data: policy } = useQuery({
    queryKey: ['analyses', 'policy'],
    queryFn: () => api.getAnalysisPolicy(),
    staleTime: 5 * 60 * 1000,
  })

  const lockDays = policy?.editLockDays ?? null

  // Permission checks
  const permissions = useMemo(() => {
    if (!analysis) return { canEdit: false, canDelete: false, isLocked: false }

    const isLocked = (() => {
      if (lockDays === null) return false
      if (getScope('ALARM_ANALYSIS', 'write') !== 'OWN') return false
      if (analysis.createdById !== currentUserId) return false
      const daysSince = Math.floor((Date.now() - new Date(analysis.createdAt).getTime()) / 86_400_000)
      return daysSince >= lockDays
    })()

    const canEdit = !isLocked && canFor('ALARM_ANALYSIS', 'write', analysis.createdById, currentUserId)
    const canDelete = !isLocked && canFor('ALARM_ANALYSIS', 'delete', analysis.createdById, currentUserId)

    return { canEdit, canDelete, isLocked }
  }, [analysis, lockDays, getScope, canFor, currentUserId])

  const isSingleOccurrence = analysis?.occurrences === 1

  const invalidateAll = () => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith('alarm-events') })
    queryClient.invalidateQueries({ queryKey: ['analyses'] })
  }

  // Unlink: remove analysisId from event + decrement occurrences (if > 1)
  const unlinkMutation = useMutation({
    mutationFn: async () => {
      if (!eventId || !analysis) throw new Error('Missing data')
      await api.updateAlarmEvent(eventId, { analysisId: null })
      if (!isSingleOccurrence && permissions.canEdit) {
        await api.updateAnalysis(analysis.productId, analysis.id, {
          occurrences: analysis.occurrences - 1,
        })
      }
    },
    onSuccess: () => {
      invalidateAll()
      toast.success(isSingleOccurrence
        ? 'Allarme scollegato (occorrenze invariate)'
        : 'Allarme scollegato e occorrenze decrementate')
      onCompleted()
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante lo scollegamento')
    },
  })

  // Delete: remove analysisId from event + delete the analysis
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!eventId || !analysis) throw new Error('Missing data')
      await api.updateAlarmEvent(eventId, { analysisId: null })
      await api.deleteAnalysis(analysis.productId, analysis.id)
    },
    onSuccess: () => {
      invalidateAll()
      toast.success('Allarme scollegato e analisi eliminata')
      onCompleted()
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante l\'eliminazione')
    },
  })

  const isPending = unlinkMutation.isPending || deleteMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scollega allarme scattato</DialogTitle>
          <DialogDescription>
            Vuoi rimuovere il collegamento tra l&apos;allarme &quot;{eventName}&quot; e questa analisi?
          </DialogDescription>
        </DialogHeader>

        {analysis && (
          <div className="space-y-3">
            {/* Analysis summary */}
            <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2.5 text-sm">
              <p className="font-medium">{analysis.alarm.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {analysis.occurrences} {analysis.occurrences === 1 ? 'occorrenza' : 'occorrenze'}
                <span className="mx-1.5 text-border">·</span>
                {analysis.operator.name}
              </p>
            </div>

            {/* Normal case: occurrences > 1 */}
            {!isSingleOccurrence && (
              <p className="text-sm text-muted-foreground">
                Le occorrenze verranno decrementate da{' '}
                <span className="font-semibold text-foreground">{analysis.occurrences}</span> a{' '}
                <span className="font-semibold text-foreground">{analysis.occurrences - 1}</span>.
              </p>
            )}

            {/* Warning: single occurrence */}
            {isSingleOccurrence && (
              <div className="rounded-md border border-amber-300/60 bg-amber-50/60 px-3 py-2.5 dark:border-amber-800/30 dark:bg-amber-950/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div className="space-y-1 text-sm">
                    <p className="font-medium text-amber-800 dark:text-amber-300">
                      Unica occorrenza
                    </p>
                    <p className="text-amber-700/80 dark:text-amber-400/70">
                      L&apos;analisi ha una sola occorrenza. Scollegando l&apos;allarme le occorrenze rimarranno a 1 ma l&apos;analisi non sarà più collegata ad alcun evento.
                      {permissions.canDelete && (
                        <> Puoi anche eliminare definitivamente l&apos;analisi.</>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Lock warning */}
            {permissions.isLocked && (
              <p className="text-xs text-muted-foreground italic">
                L&apos;analisi è bloccata (oltre {lockDays} giorni dalla creazione). Non è possibile modificarla o eliminarla.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Annulla
          </Button>
          <Button
            variant="secondary"
            onClick={() => unlinkMutation.mutate()}
            disabled={isPending}
          >
            {unlinkMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Unlink className="mr-2 h-4 w-4" />
            Scollega
          </Button>
          {isSingleOccurrence && permissions.canDelete && (
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Trash2 className="mr-2 h-4 w-4" />
              Elimina analisi
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
