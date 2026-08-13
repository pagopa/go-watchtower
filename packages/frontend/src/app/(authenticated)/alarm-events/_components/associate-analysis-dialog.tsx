'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Calendar, Hash, Activity, Siren, Tag,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
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
  DetailField,
  NoAnalysisSelected,
  OptionToggle,
  OptionTransition,
  SelectedAnalysisSummary,
} from './associate-analysis-parts'

interface AssociateAnalysisDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: AlarmEvent | null
  onAssociated: () => void
}

// ─── Event summary (left pane) ───────────────────────────────────────────────

function EventSummary({ event }: { event: AlarmEvent }) {
  return (
    <div className="shrink-0 border-b bg-muted/15 px-4 py-3.5">
      <div className="flex items-center gap-2 mb-2.5">
        <Siren className="h-4 w-4 text-amber-500 dark:text-amber-400" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Evento allarme</h3>
      </div>

      <p className="text-[15px] font-semibold leading-snug mb-2.5 break-words">{event.name}</p>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <DetailField icon={Calendar} label="Data / ora">
          <span className="font-mono tabular-nums text-xs">{formatDateTimeRome(event.firedAt)}</span>
        </DetailField>

        <DetailField icon={Tag} label="Prodotto">
          <span className="font-medium text-xs">{event.product.name}</span>
        </DetailField>

        <DetailField icon={Activity} label="Ambiente">
          <span className="text-xs">{event.environment.name}</span>
        </DetailField>

        {event.awsRegion && (
          <DetailField icon={Hash} label="Region AWS">
            <span className="font-mono text-xs">{event.awsRegion}</span>
          </DetailField>
        )}

        {event.awsAccountId && (
          <DetailField icon={Hash} label="Account AWS">
            <span className="font-mono text-xs">{event.awsAccountId}</span>
          </DetailField>
        )}
      </div>
    </div>
  )
}

function AlarmNameMismatchWarning({ analysisName, eventName }: { analysisName: string; eventName: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-amber-300/50 bg-amber-50/50 px-3.5 py-3 dark:border-amber-800/25 dark:bg-amber-950/15">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Nome allarme diverso</p>
        <p className="text-xs text-amber-700/70 dark:text-amber-400/60 mt-0.5 leading-relaxed">
          L&apos;analisi si riferisce a <span className="font-semibold">&quot;{analysisName}&quot;</span>,
          l&apos;evento a <span className="font-semibold">&quot;{eventName}&quot;</span>.
        </p>
      </div>
    </div>
  )
}

// ─── Main dialog ─────────────────────────────────────────────────────────────

export function AssociateAnalysisDialog({
  open,
  onOpenChange,
  event,
  onAssociated,
}: AssociateAnalysisDialogProps) {
  const queryClient = useQueryClient()
  const options = useAssociationOptions()
  const {
    ownOnly, query, analyses,
    selectedAnalysisId, setSelectedAnalysisId, selectedAnalysis,
  } = useAssociableAnalyses(event, open)

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedAnalysisId(null)
      options.reset()
    }
    onOpenChange(isOpen)
  }

  const alarmNameMismatch = !!(event && selectedAnalysis && selectedAnalysis.alarm.name !== event.name)

  const eventIsNewer = !!(
    event && selectedAnalysis &&
    new Date(event.firedAt).getTime() > new Date(selectedAnalysis.lastAlarmAt).getTime()
  )

  const isCompleted = selectedAnalysis?.status === AnalysisStatuses.COMPLETED

  const associateMutation = useMutation({
    mutationFn: async () => {
      if (!event || !selectedAnalysisId) throw new Error('Missing data')

      const analysisUpdates: {
        incrementOccurrences?: boolean
        lastAlarmAt?: string
        reopenAnalysis?: boolean
      } = {}

      if (options.incrementOccurrences) analysisUpdates.incrementOccurrences = true
      if (options.updateLastAlarmAt && eventIsNewer) analysisUpdates.lastAlarmAt = event.firedAt
      if (options.reopenAnalysis && isCompleted) analysisUpdates.reopenAnalysis = true

      const hasUpdates = Object.keys(analysisUpdates).length > 0
      await api.linkAlarmEventAnalysis(
        event.id,
        selectedAnalysisId,
        hasUpdates ? analysisUpdates : undefined,
      )
    },
    onSuccess: () => {
      invalidate(queryClient, 'alarmEvents', 'analyses')
      toast.success('Evento associato all\'analisi')
      onAssociated()
      handleOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante l\'associazione')
    },
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[1240px] max-h-[calc(100vh-16rem)] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogTitle className="sr-only">Associa evento ad analisi</DialogTitle>

        <div className="flex flex-1 min-h-0" style={{ minHeight: 'min(680px, calc(100vh - 18rem))' }}>

          {/* ─── Left: Event details + Analysis list ──────────────── */}
          <div className="w-[480px] shrink-0 border-r flex flex-col min-h-0">
            {event && <EventSummary event={event} />}
            <AnalysisPickerPane
              className="flex-1 flex flex-col min-h-0"
              analyses={analyses}
              isLoading={query.isLoading}
              isError={query.isError}
              onRetry={() => query.refetch()}
              selectedAnalysisId={selectedAnalysisId}
              onSelectAnalysis={setSelectedAnalysisId}
              ownOnly={ownOnly}
            />
          </div>

          {/* ─── Right: Selected analysis + Options ───────────────── */}
          <div className="flex-1 flex flex-col min-w-0">
            {!selectedAnalysis ? (
              <NoAnalysisSelected />
            ) : (
              <>
                <SelectedAnalysisSummary
                  analysis={selectedAnalysis}
                  warning={alarmNameMismatch && event
                    ? <AlarmNameMismatchWarning analysisName={selectedAnalysis.alarm.name} eventName={event.name} />
                    : undefined}
                />

                <AssociationOptionsFooter
                  onCancel={() => handleOpenChange(false)}
                  onConfirm={() => associateMutation.mutate()}
                  confirmLabel="Associa"
                  isPending={associateMutation.isPending}
                  confirmDisabled={!selectedAnalysisId}
                >
                  <OptionToggle
                    id="increment-occurrences"
                    checked={options.incrementOccurrences}
                    onCheckedChange={options.setIncrementOccurrences}
                    title="Incrementa occorrenze"
                    description="Aumenta di 1 il conteggio delle occorrenze dell'analisi, registrando che questo evento rappresenta una nuova manifestazione dello stesso problema."
                  >
                    {options.incrementOccurrences && (
                      <OptionTransition
                        from={String(selectedAnalysis.occurrences)}
                        to={String(selectedAnalysis.occurrences + 1)}
                      />
                    )}
                  </OptionToggle>

                  <OptionToggle
                    id="update-last-alarm-at"
                    checked={options.updateLastAlarmAt && eventIsNewer}
                    onCheckedChange={options.setUpdateLastAlarmAt}
                    disabled={!eventIsNewer}
                    title="Aggiorna data ultimo allarme"
                    description={eventIsNewer
                      ? 'Aggiorna la data dell\'ultimo allarme dell\'analisi con la data di questo evento, poiché è più recente di quella attualmente registrata.'
                      : 'L\'evento non è più recente dell\'ultimo allarme registrato nell\'analisi, quindi questa opzione non è disponibile.'}
                  >
                    {eventIsNewer && options.updateLastAlarmAt && (
                      <OptionTransition
                        from={`${formatDateTimeUTC(selectedAnalysis.lastAlarmAt)} UTC`}
                        to={`${formatDateTimeUTC(event?.firedAt ?? '')} UTC`}
                      />
                    )}
                  </OptionToggle>

                  <OptionToggle
                    id="reopen-analysis"
                    checked={options.reopenAnalysis && isCompleted}
                    onCheckedChange={options.setReopenAnalysis}
                    disabled={!isCompleted}
                    title="Riapri analisi"
                    description={isCompleted
                      ? 'L\'analisi è completata. Riportala allo stato "In corso" per segnalare che un nuovo allarme richiede ulteriore analisi.'
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
