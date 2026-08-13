'use client'

import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, Siren } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { api, type AlarmEvent } from '@/lib/api-client'
import { invalidate } from '@/lib/query-invalidation'
import { ANALYSIS_STATUS_LABELS, AnalysisStatuses } from '@go-watchtower/shared'
import {
  formatDateTimeRome,
  formatDateTimeUTC,
} from '../../analyses/_lib/constants'
import {
  useAssociableAnalyses,
  useAssociationOptions,
} from '../_lib/use-associate-analysis'
import {
  AnalysisPickerPane,
  AssociationOptionsFooter,
  NoAnalysisSelected,
  OptionToggle,
  OptionTransition,
  SelectedAnalysisSummary,
} from './associate-analysis-parts'

interface BulkAssociateAnalysisDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedEvents: AlarmEvent[]
  onCompleted: () => void
}

// ─── Selected events pane ────────────────────────────────────────────────────

function SelectedEventsPane({
  events,
  representative,
  oldestFiredAt,
  newestFiredAt,
}: {
  events: AlarmEvent[]
  representative: AlarmEvent | null
  oldestFiredAt: string | null
  newestFiredAt: string | null
}) {
  return (
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
            {events.length}
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
          {events.map((event) => (
            <div key={event.id} className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5">
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
  const options = useAssociationOptions()

  // All selected events share the same product, environment, and alarm name
  // (enforced by the toolbar eligibility check), so we use the first event.
  const representative = selectedEvents[0] ?? null
  const eventCount = selectedEvents.length

  const { newestFiredAt, oldestFiredAt } = useMemo(() => {
    if (selectedEvents.length === 0) return { newestFiredAt: null, oldestFiredAt: null }
    let newest = selectedEvents[0].firedAt
    let oldest = selectedEvents[0].firedAt
    for (const e of selectedEvents) {
      if (e.firedAt > newest) newest = e.firedAt
      if (e.firedAt < oldest) oldest = e.firedAt
    }
    return { newestFiredAt: newest, oldestFiredAt: oldest }
  }, [selectedEvents])

  const {
    ownOnly, query, analyses,
    selectedAnalysisId, setSelectedAnalysisId, selectedAnalysis,
  } = useAssociableAnalyses(representative, open)

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedAnalysisId(null)
      options.reset()
    }
    onOpenChange(isOpen)
  }

  const eventIsNewer = !!(
    newestFiredAt && selectedAnalysis &&
    new Date(newestFiredAt).getTime() > new Date(selectedAnalysis.lastAlarmAt).getTime()
  )

  const isCompleted = selectedAnalysis?.status === AnalysisStatuses.COMPLETED

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

        if (options.incrementOccurrences) {
          analysisUpdates.incrementOccurrences = true
        }
        // Only send lastAlarmAt and reopenAnalysis once (on the first event)
        // to avoid redundant updates. incrementOccurrences is sent for each
        // event since each call increments by 1.
        if (isFirst && options.updateLastAlarmAt && eventIsNewer && newestFiredAt) {
          analysisUpdates.lastAlarmAt = newestFiredAt
        }
        if (isFirst && options.reopenAnalysis && isCompleted) {
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[1400px] max-h-[calc(100vh-16rem)] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogTitle className="sr-only">Associa eventi ad analisi esistente</DialogTitle>

        <div className="flex flex-1 min-h-0" style={{ minHeight: 'min(680px, calc(100vh - 18rem))' }}>

          <SelectedEventsPane
            events={selectedEvents}
            representative={representative}
            oldestFiredAt={oldestFiredAt}
            newestFiredAt={newestFiredAt}
          />

          <AnalysisPickerPane
            className="w-[380px] shrink-0 border-r flex flex-col min-h-0"
            analyses={analyses}
            isLoading={query.isLoading}
            isError={query.isError}
            onRetry={() => query.refetch()}
            selectedAnalysisId={selectedAnalysisId}
            onSelectAnalysis={setSelectedAnalysisId}
            ownOnly={ownOnly}
          />

          {/* ─── Right: Selected analysis + Options ───────────────── */}
          <div className="flex-1 flex flex-col min-w-0">
            {!selectedAnalysis ? (
              <NoAnalysisSelected />
            ) : (
              <>
                <SelectedAnalysisSummary analysis={selectedAnalysis} />

                <AssociationOptionsFooter
                  onCancel={() => handleOpenChange(false)}
                  onConfirm={() => associateMutation.mutate()}
                  confirmLabel={`Associa ${eventCount} eventi`}
                  isPending={associateMutation.isPending}
                  confirmDisabled={!selectedAnalysisId}
                >
                  <OptionToggle
                    id="bulk-increment-occurrences"
                    checked={options.incrementOccurrences}
                    onCheckedChange={options.setIncrementOccurrences}
                    title="Incrementa occorrenze"
                    description={`Aumenta di ${eventCount} il conteggio delle occorrenze dell'analisi (1 per ciascun evento selezionato).`}
                  >
                    {options.incrementOccurrences && (
                      <OptionTransition
                        from={String(selectedAnalysis.occurrences)}
                        to={String(selectedAnalysis.occurrences + eventCount)}
                      />
                    )}
                  </OptionToggle>

                  <OptionToggle
                    id="bulk-update-last-alarm-at"
                    checked={options.updateLastAlarmAt && eventIsNewer}
                    onCheckedChange={options.setUpdateLastAlarmAt}
                    disabled={!eventIsNewer}
                    title="Aggiorna data ultimo allarme"
                    description={eventIsNewer
                      ? 'Aggiorna la data dell\'ultimo allarme con la data dell\'evento più recente tra quelli selezionati.'
                      : 'Nessun evento selezionato è più recente dell\'ultimo allarme registrato nell\'analisi.'}
                  >
                    {eventIsNewer && options.updateLastAlarmAt && newestFiredAt && (
                      <OptionTransition
                        from={`${formatDateTimeUTC(selectedAnalysis.lastAlarmAt)} UTC`}
                        to={`${formatDateTimeUTC(newestFiredAt)} UTC`}
                      />
                    )}
                  </OptionToggle>

                  <OptionToggle
                    id="bulk-reopen-analysis"
                    checked={options.reopenAnalysis && isCompleted}
                    onCheckedChange={options.setReopenAnalysis}
                    disabled={!isCompleted}
                    title="Riapri analisi"
                    description={isCompleted
                      ? 'L\'analisi è completata. Riportala allo stato "In corso" per segnalare che nuovi allarmi richiedono ulteriore analisi.'
                      : 'L\'analisi non è in stato completato, quindi non è necessario riaprirla.'}
                  >
                    {isCompleted && options.reopenAnalysis && (
                      <OptionTransition
                        mono={false}
                        from={ANALYSIS_STATUS_LABELS[AnalysisStatuses.COMPLETED]}
                        to={ANALYSIS_STATUS_LABELS[AnalysisStatuses.IN_PROGRESS]}
                      />
                    )}
                  </OptionToggle>
                </AssociationOptionsFooter>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
