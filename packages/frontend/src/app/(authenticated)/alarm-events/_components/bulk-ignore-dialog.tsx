'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { Loader2, Ban, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  api,
  type AlarmEvent,
  type IgnoreReason,
  type CreateAlarmAnalysisData,
} from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { invalidate } from '@/lib/query-invalidation'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { DynamicIgnoreDetailsForm, buildIgnoreDetailsZodSchema } from '@/components/ui/json-schema-form'
import { useForm, type FieldValues } from 'react-hook-form'
import { isoToRomeLocal, romeLocalToISO } from '../../analyses/_components/analysis-form-schemas'

interface GroupedAlarmRow {
  /** Chiave di raggruppamento */
  key: string
  /** Nome allarme visualizzato */
  alarmName: string
  /** ID dell'allarme Alarm entity (necessario per creare analisi) */
  alarmId: string
  productId: string
  productName: string
  environmentId: string
  environmentName: string
  /** Numero di eventi in questo gruppo */
  occurrences: number
  /** Data del primo allarme (min firedAt) */
  firstAlarmAt: string
  /** Data dell'ultimo allarme (max firedAt) */
  lastAlarmAt: string
  /** IDs degli alarm event originali */
  eventIds: string[]
}

interface BulkIgnoreDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedEvents: AlarmEvent[]
  onCompleted: () => void
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC',
  })
}

export function BulkIgnoreDialog({
  open,
  onOpenChange,
  selectedEvents,
  onCompleted,
}: BulkIgnoreDialogProps) {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const [ignoreReasonCode, setIgnoreReasonCode] = useState('')
  const [analysisDate, setAnalysisDate] = useState(() => isoToRomeLocal(new Date().toISOString()))

  const { data: ignoreReasons } = useQuery<IgnoreReason[]>({
    queryKey: qk.ignoreReasons.list,
    queryFn: () => api.getIgnoreReasons(),
    enabled: open,
  })

  const selectedReason = useMemo(
    () => ignoreReasons?.find((r) => r.code === ignoreReasonCode) ?? null,
    [ignoreReasons, ignoreReasonCode]
  )

  // Form per i dettagli dinamici dello schema
  const { control, reset: resetDetails, getValues, setError, formState: { errors: detailsErrors } } = useForm()

  // Raggruppa gli eventi selezionati
  const { grouped, skipped } = useMemo(() => {
    const map = new Map<string, GroupedAlarmRow>()
    const skippedEvents: AlarmEvent[] = []

    for (const event of selectedEvents) {
      if (!event.alarmId || !event.alarm) {
        skippedEvents.push(event)
        continue
      }

      const key = `${event.product.id}:${event.environment.id}:${event.alarmId}`
      const existing = map.get(key)

      if (existing) {
        existing.occurrences++
        if (event.firedAt < existing.firstAlarmAt) existing.firstAlarmAt = event.firedAt
        if (event.firedAt > existing.lastAlarmAt) existing.lastAlarmAt = event.firedAt
        existing.eventIds.push(event.id)
      } else {
        map.set(key, {
          key,
          alarmName: event.alarm.name,
          alarmId: event.alarmId,
          productId: event.product.id,
          productName: event.product.name,
          environmentId: event.environment.id,
          environmentName: event.environment.name,
          occurrences: 1,
          firstAlarmAt: event.firedAt,
          lastAlarmAt: event.firedAt,
          eventIds: [event.id],
        })
      }
    }

    return {
      grouped: Array.from(map.values()).sort((a, b) =>
        a.productName.localeCompare(b.productName) || a.alarmName.localeCompare(b.alarmName)
      ),
      skipped: skippedEvents,
    }
  }, [selectedEvents])

  const handleBulkSubmit = () => {
    // Validate dynamic ignore details before starting the mutation
    if (selectedReason?.detailsSchema) {
      const formValues = getValues()
      const detailsZod = buildIgnoreDetailsZodSchema(selectedReason.detailsSchema)
      const result = detailsZod.safeParse(formValues?.ignoreDetails)
      if (!result.success) {
        for (const issue of result.error.issues) {
          const field = issue.path[0] as string
          setError(`ignoreDetails.${field}`, { message: issue.message })
        }
        return
      }
    }
    bulkMutation.mutate()
  }

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const operatorId = session?.user?.id
      if (!operatorId) throw new Error('Utente non autenticato')
      if (!ignoreReasonCode) throw new Error('Seleziona un motivo di esclusione')

      // Read form values at submission time
      const formValues = getValues()
      const details = formValues && Object.keys(formValues).length > 0 ? formValues : null

      const results: { row: GroupedAlarmRow; analysisId: string }[] = []

      for (const row of grouped) {
        const data: CreateAlarmAnalysisData = {
          analysisDate: romeLocalToISO(analysisDate),
          firstAlarmAt: row.firstAlarmAt,
          lastAlarmAt: row.lastAlarmAt,
          occurrences: row.occurrences,
          alarmId: row.alarmId,
          operatorId,
          environmentId: row.environmentId,
          analysisType: 'IGNORABLE',
          status: 'COMPLETED',
          ignoreReasonCode,
          ignoreDetails: details,
          isOnCall: false,
        }

        const analysis = await api.createAnalysis(row.productId, data)
        results.push({ row, analysisId: analysis.id })

        // Collega ogni evento all'analisi creata
        for (const eventId of row.eventIds) {
          await api.linkAlarmEventAnalysis(eventId, analysis.id)
        }
      }

      return results
    },
    onSuccess: (results) => {
      invalidate(queryClient, 'alarmEvents', 'analyses')
      toast.success(`${results.length} analisi create e ${selectedEvents.length - skipped.length} eventi collegati`)
      setIgnoreReasonCode('')
      setAnalysisDate(isoToRomeLocal(new Date().toISOString()))
      resetDetails()
      onOpenChange(false)
      onCompleted()
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante la creazione delle analisi')
    },
  })

  const canSubmit = ignoreReasonCode && analysisDate && grouped.length > 0 && !bulkMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5" />
            Crea analisi da ignorare
          </DialogTitle>
          <DialogDescription>
            Verranno create <strong>{grouped.length}</strong> analisi di tipo ignorabile
            a partire da <strong>{selectedEvents.length - skipped.length}</strong> allarmi selezionati.
          </DialogDescription>
        </DialogHeader>

        {skipped.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
            <div>
              <strong>{skipped.length}</strong> eventi esclusi perché non associati ad un allarme catalogato.
            </div>
          </div>
        )}

        {/* Tabella raggruppata */}
        {grouped.length > 0 && (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs">Prodotto</TableHead>
                  <TableHead className="text-xs">Ambiente</TableHead>
                  <TableHead className="text-xs">Allarme</TableHead>
                  <TableHead className="text-xs text-center w-24">Occorrenze</TableHead>
                  <TableHead className="text-xs w-40">Primo allarme</TableHead>
                  <TableHead className="text-xs w-40">Ultimo allarme</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="py-2 text-sm">{row.productName}</TableCell>
                    <TableCell className="py-2 text-sm text-muted-foreground">{row.environmentName}</TableCell>
                    <TableCell className="py-2 text-sm font-medium">{row.alarmName}</TableCell>
                    <TableCell className="py-2 text-sm text-center tabular-nums font-medium">{row.occurrences}</TableCell>
                    <TableCell className="py-2 font-mono text-xs tabular-nums text-muted-foreground">{formatDateTime(row.firstAlarmAt)}</TableCell>
                    <TableCell className="py-2 font-mono text-xs tabular-nums text-muted-foreground">{formatDateTime(row.lastAlarmAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Data analisi + Motivo esclusione */}
        <div className="space-y-4 border-t pt-4">
          <div className="space-y-2">
            <Label>Data analisi * <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide">ora Roma</span></Label>
            <DateTimePicker
              value={analysisDate}
              onChange={setAnalysisDate}
              disabled={bulkMutation.isPending}
              showNow
              nowTimezone="Europe/Rome"
            />
          </div>

          <div className="space-y-2">
            <Label>Motivo di esclusione *</Label>
            <Select value={ignoreReasonCode} onValueChange={setIgnoreReasonCode} disabled={bulkMutation.isPending}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona un motivo" />
              </SelectTrigger>
              <SelectContent>
                {ignoreReasons?.map((r) => (
                  <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedReason?.detailsSchema && (
            <DynamicIgnoreDetailsForm
              control={control as unknown as import('react-hook-form').Control<FieldValues>}
              schema={selectedReason.detailsSchema}
              disabled={bulkMutation.isPending}
              errors={detailsErrors}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={bulkMutation.isPending}>
            Annulla
          </Button>
          <Button onClick={handleBulkSubmit} disabled={!canSubmit}>
            {bulkMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crea {grouped.length} analisi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
