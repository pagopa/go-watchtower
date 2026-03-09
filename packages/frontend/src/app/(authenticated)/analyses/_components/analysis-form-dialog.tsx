'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useForm, Controller, useFieldArray, useWatch, type Control, type FieldErrors, type FieldValues, type Resolver, type UseFormRegister } from 'react-hook-form'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { Bell, CheckSquare, FileSearch, Loader2, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox'
import { Combobox } from '@/components/ui/combobox'
import { usePermissions } from '@/hooks/use-permissions'
import { inferLinkType, matchIgnoredAlarm } from '@go-watchtower/shared'
import {
  api,
  type AlarmAnalysis,
  type AnalysisType,
  type AnalysisStatus,
  type Environment,
  type Alarm,
  type FinalAction,
  type Runbook,
  type Microservice,
  type Downstream,
  type Product,
  type UserDetail,
  type IgnoredAlarm,
} from '@/lib/api-client'

import {
  analysisFormSchema,
  isoToRomeLocal,
  isoToUTCLocal,
  romeLocalToISO,
  utcLocalToISO,
  useDateValidation,
  type AnalysisFormData,
} from './analysis-form-schemas'

import {
  AlarmField,
  EnvironmentField,
  OccurrencesField,
  FirstAlarmField,
  LastAlarmField,
  AnalysisDateField,
  OperatorField,
  IgnoreReasonField,
  ProductSelectorCard,
  TrackingIdsField,
  LinksField,
} from './analysis-form-fields'
import { DynamicIgnoreDetailsForm } from '@/components/ui/json-schema-form'

import { ANALYSIS_TYPE_LABELS, ANALYSIS_STATUS_LABELS } from '../_lib/constants'
import { IgnoredAlarmWarningBanner } from './ignored-alarm-warning'

export type { AnalysisFormData }

const NO_VALUE = '__none__'

// --- Section component ---

type SectionColor = 'amber' | 'blue' | 'emerald'

const SECTION_STYLES: Record<SectionColor, {
  border: string
  headerBg: string
  headerBorder: string
  marker: string
  text: string
}> = {
  amber: {
    border: 'border-amber-500/20 dark:border-amber-500/15',
    headerBg: 'bg-amber-50 dark:bg-amber-950/30',
    headerBorder: 'border-b border-amber-200/60 dark:border-amber-500/15',
    marker: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-400',
  },
  blue: {
    border: 'border-blue-500/20 dark:border-blue-500/15',
    headerBg: 'bg-blue-50 dark:bg-blue-950/30',
    headerBorder: 'border-b border-blue-200/60 dark:border-blue-500/15',
    marker: 'bg-blue-500',
    text: 'text-blue-700 dark:text-blue-400',
  },
  emerald: {
    border: 'border-emerald-500/20 dark:border-emerald-500/15',
    headerBg: 'bg-emerald-50 dark:bg-emerald-950/30',
    headerBorder: 'border-b border-emerald-200/60 dark:border-emerald-500/15',
    marker: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
}

function FormSection({
  label,
  color,
  icon: Icon,
  children,
  className,
}: {
  label: string
  color: SectionColor
  icon: LucideIcon
  children: React.ReactNode
  className?: string
}) {
  const c = SECTION_STYLES[color]
  return (
    <div className={cn('overflow-hidden rounded-xl border shadow-sm', c.border, className)}>
      <div className={cn('flex items-center gap-2.5 px-5 py-3.5', c.headerBg, c.headerBorder)}>
        <Icon className={cn('h-3.5 w-3.5 shrink-0', c.text)} />
        <h3 className={cn('text-xs font-semibold uppercase tracking-widest', c.text)}>
          {label}
        </h3>
      </div>
      {children}
    </div>
  )
}

// --- Props ---

interface AnalysisFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editItem: AlarmAnalysis | null
  onSubmit: (data: AnalysisFormData) => void
  isPending: boolean
  users: UserDetail[] | undefined
  products?: Product[] | undefined
  showProductSelector?: boolean
  selectedProductId?: string
  onProductChange?: (productId: string) => void
  futureOffsetMinutes?: number | null
  /** Initial values for pre-filling the form (e.g. from an alarm event). Merged with defaults on create. */
  initialValues?: Partial<AnalysisFormData>
}

export function AnalysisFormDialog({
  open,
  onOpenChange,
  editItem,
  onSubmit,
  isPending,
  users,
  products,
  showProductSelector,
  selectedProductId,
  onProductChange,
  futureOffsetMinutes,
  initialValues,
}: AnalysisFormDialogProps) {
  const { data: session } = useSession()
  const { can } = usePermissions()

  const productId = editItem?.productId || selectedProductId || ''

  const { data: environments } = useQuery<Environment[]>({
    queryKey: ['products', productId, 'environments'],
    queryFn: () => api.getEnvironments(productId),
    enabled: open && !!productId,
  })

  const { data: alarms } = useQuery<Alarm[]>({
    queryKey: ['products', productId, 'alarms'],
    queryFn: () => api.getAlarms(productId),
    enabled: open && !!productId,
  })

  const { data: finalActions } = useQuery<FinalAction[]>({
    queryKey: ['products', productId, 'final-actions'],
    queryFn: () => api.getFinalActions(productId),
    enabled: open && !!productId,
  })

  const { data: runbooks } = useQuery<Runbook[]>({
    queryKey: ['products', productId, 'runbooks'],
    queryFn: () => api.getRunbooks(productId),
    enabled: open && !!productId,
  })

  const { data: microservices } = useQuery<Microservice[]>({
    queryKey: ['products', productId, 'microservices'],
    queryFn: () => api.getMicroservices(productId),
    enabled: open && !!productId,
  })

  const { data: downstreams } = useQuery<Downstream[]>({
    queryKey: ['products', productId, 'downstreams'],
    queryFn: () => api.getDownstreams(productId),
    enabled: open && !!productId,
  })

  const { data: ignoreReasons } = useQuery({
    queryKey: ['ignore-reasons'],
    queryFn: () => api.getIgnoreReasons(),
    staleTime: Infinity,
  })

  const { data: ignoredAlarms } = useQuery<IgnoredAlarm[]>({
    queryKey: ['products', productId, 'ignored-alarms'],
    queryFn: () => api.getIgnoredAlarms(productId),
    enabled: open && !!productId && !editItem,
    staleTime: 60_000,
  })

  const availableUsers = useMemo(() => {
    if (!can('USER', 'read')) {
      // Operator: can only select themselves.
      // Prefer the entry from the users list; fall back to session data.
      const self = users?.find((u) => u.id === session?.user?.id)
      if (self) return [self]
      if (session?.user?.id) {
        return [{ id: session.user.id, name: session.user.name, email: session.user.email } as UserDetail]
      }
      return []
    }
    return users ?? []
  }, [users, can, session?.user?.id, session?.user?.name, session?.user?.email])

  const isOperatorLocked = availableUsers.length <= 1

  const lastAlarmAutoFilledRef = useRef(false)

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    getValues,
    formState: { errors: typedErrors, isDirty },
  } = useForm<AnalysisFormData>({
    resolver: zodResolver(analysisFormSchema) as Resolver<AnalysisFormData>,
    defaultValues: {
      analysisDate: '',
      firstAlarmAt: '',
      lastAlarmAt: '',
      alarmId: '',
      environmentId: '',
      operatorId: '',
      finalActionIds: [],
      analysisType: 'ANALYZABLE',
      status: 'CREATED',
      occurrences: '' as unknown as number,
      isOnCall: false,
      errorDetails: '',
      conclusionNotes: '',
      ignoreReasonCode: undefined,
      ignoreDetails: undefined,
      runbookId: undefined,
      microserviceIds: [],
      downstreamIds: [],
      links: [],
      trackingIds: [],
    },
  })

  // Widen types for polymorphic field components (react-hook-form Control is invariant)
  const fvControl = control as unknown as Control<FieldValues>
  const fvRegister = register as unknown as UseFormRegister<FieldValues>
  const errors = typedErrors as FieldErrors<FieldValues>

  const { fields: linkFields, append: appendLink, remove: removeLink } = useFieldArray({
    control,
    name: 'links',
  })

  const { fields: trackingFields, append: appendTracking, remove: removeTracking } = useFieldArray({
    control,
    name: 'trackingIds',
  })

  useEffect(() => {
    if (!open) return // skip the reset when the dialog is closing
    if (editItem) {
      reset({
        // analysisDate was entered in Rome local time → display in Rome TZ
        analysisDate: isoToRomeLocal(editItem.analysisDate),
        // alarm timestamps are UTC (from monitoring systems) → display as UTC
        firstAlarmAt: isoToUTCLocal(editItem.firstAlarmAt),
        lastAlarmAt: isoToUTCLocal(editItem.lastAlarmAt),
        alarmId: editItem.alarmId,
        environmentId: editItem.environmentId,
        operatorId: editItem.operatorId,
        finalActionIds: editItem.finalActions.map((fa) => fa.id),
        analysisType: editItem.analysisType,
        status: editItem.status,
        occurrences: editItem.occurrences,
        isOnCall: editItem.isOnCall,
        errorDetails: editItem.errorDetails || '',
        conclusionNotes: editItem.conclusionNotes || '',
        ignoreReasonCode: editItem.ignoreReasonCode || undefined,
        ignoreDetails: (editItem.ignoreDetails as Record<string, unknown>) || undefined,
        runbookId: editItem.runbookId || undefined,
        microserviceIds: editItem.microservices.map((ms) => ms.id),
        downstreamIds: editItem.downstreams.map((ds) => ds.id),
        links: editItem.links?.map((l) => ({ url: l.url, name: l.name || '', type: l.type || '' })) || [],
        trackingIds: editItem.trackingIds?.map((t) => ({
          traceId: t.traceId,
          errorCode: t.errorCode || '',
          errorDetail: t.errorDetail || '',
          timestamp: t.timestamp || '',
        })) || [],
      })
    } else {
      reset({
        analysisDate: '',
        firstAlarmAt: '',
        lastAlarmAt: '',
        alarmId: '',
        environmentId: '',
        operatorId: session?.user?.id ?? '',
        finalActionIds: [],
        analysisType: 'ANALYZABLE',
        status: 'CREATED',
        occurrences: '' as unknown as number,
        isOnCall: false,
        errorDetails: '',
        conclusionNotes: '',
        ignoreReasonCode: undefined,
        ignoreDetails: undefined,
        runbookId: undefined,
        microserviceIds: [],
        downstreamIds: [],
        links: [],
        trackingIds: [],
        ...initialValues,
      })
    }
    lastAlarmAutoFilledRef.current = false
  }, [editItem, reset, open, session?.user?.id, initialValues])

  const watchedFirstAlarm = watch('firstAlarmAt')
  const watchedLastAlarm = watch('lastAlarmAt')
  const watchedAnalysisDate = watch('analysisDate')
  const watchedAnalysisType = watch('analysisType')
  const watchedIgnoreReasonCode = watch('ignoreReasonCode')
  const watchedAlarmId = watch('alarmId')
  const watchedEnvironmentId = watch('environmentId')
  const watchedLinks = useWatch({ control, name: 'links' })
  const watchedLinkUrls = useMemo(
    () => watchedLinks?.map((l) => l?.url ?? '') ?? [],
    [watchedLinks]
  )

  // Find the selected ignore reason to get its detailsSchema
  const selectedIgnoreReason = ignoreReasons?.find((r) => r.code === watchedIgnoreReasonCode)

  // Compute whether the selected alarm+environment+firstAlarmAt matches an ignored alarm rule.
  // Only active in create mode (editItem is null).
  const ignoredAlarmMatch = useMemo((): IgnoredAlarm | null => {
    if (editItem || !watchedAlarmId || !watchedEnvironmentId || !watchedFirstAlarm || !ignoredAlarms) {
      return null
    }
    // firstAlarmAt is a datetime-local string entered as UTC: "YYYY-MM-DDTHH:mm"
    const firstAlarmDate = new Date(watchedFirstAlarm + ':00.000Z')
    const matched = matchIgnoredAlarm({
      alarmId: watchedAlarmId,
      environmentId: watchedEnvironmentId,
      firstAlarmAt: firstAlarmDate,
      ignoredAlarms,
    })
    if (!matched) return null
    return ignoredAlarms.find((ia) => ia.id === matched.id) ?? null
  }, [editItem, watchedAlarmId, watchedEnvironmentId, watchedFirstAlarm, ignoredAlarms])

  const dateValidation = useDateValidation(watchedFirstAlarm, watchedLastAlarm, watchedAnalysisDate, futureOffsetMinutes)

  const handleFirstAlarmChange = (value: string, fieldOnChange: (v: string) => void) => {
    fieldOnChange(value)
    if (value && !lastAlarmAutoFilledRef.current && !getValues('lastAlarmAt')) {
      setValue('lastAlarmAt', value)
      lastAlarmAutoFilledRef.current = true
    }
  }

  const hasDateErrors = dateValidation.analysisDateError !== '' || dateValidation.lastAlarmError !== ''

  const handleFormSubmit = (data: AnalysisFormData) => {
    if (hasDateErrors) return
    onSubmit({
      ...data,
      // analysisDate is entered as Rome local time → convert to UTC ISO
      analysisDate: romeLocalToISO(data.analysisDate),
      // alarm timestamps are entered as UTC → treat as UTC ISO
      firstAlarmAt: utcLocalToISO(data.firstAlarmAt),
      lastAlarmAt: utcLocalToISO(data.lastAlarmAt),
      ignoreReasonCode: data.analysisType === 'IGNORABLE' ? (data.ignoreReasonCode || undefined) : undefined,
      ignoreDetails: data.analysisType === 'IGNORABLE' ? (data.ignoreDetails || undefined) : undefined,
      runbookId: data.runbookId || undefined,
      links: data.links?.map((l) => ({
        url: l.url,
        name: l.name || undefined,
        type: l.type || inferLinkType(l.url),
      })),
      trackingIds: data.trackingIds?.map((t) => ({
        traceId: t.traceId,
        errorCode: t.errorCode || undefined,
        errorDetail: t.errorDetail || undefined,
        timestamp: t.timestamp || undefined,
      })),
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isDirty || v) onOpenChange(v) }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" isDirty={isDirty} onDirtyClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>
            {editItem ? 'Modifica Analisi' : 'Nuova Analisi'}
          </DialogTitle>
          <DialogDescription>
            {editItem
              ? 'Modifica i dettagli dell\'analisi allarme.'
              : 'Crea una nuova analisi allarme.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
          {/* Product Selector (only in "all" view when creating) */}
          {showProductSelector && (
            <ProductSelectorCard
              products={products}
              selectedProductId={selectedProductId || ''}
              onProductChange={(val) => onProductChange?.(val)}
              disabled={isPending}
            />
          )}

          {/* ── Sezione 1: Informazioni Allarme ── */}
          <FormSection label="Informazioni Allarme" color="amber" icon={Bell}>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <AnalysisDateField
                control={fvControl}
                errors={errors}
                disabled={isPending}
                dateError={dateValidation.analysisDateError}
              />

              <OperatorField
                control={fvControl}
                errors={errors}
                disabled={isPending}
                users={availableUsers}
                locked={isOperatorLocked}
              />

              <AlarmField
                control={fvControl}
                errors={errors}
                disabled={isPending}
                alarms={alarms}
                onAlarmChange={(alarm) => {
                  if (!editItem && alarm.runbookId) {
                    setValue('runbookId', alarm.runbookId)
                  }
                }}
              />

              <OccurrencesField
                registration={register('occurrences')}
                errors={errors}
                disabled={isPending}
              />

              <EnvironmentField
                control={fvControl}
                errors={errors}
                disabled={isPending}
                environments={environments}
              />

              <FirstAlarmField
                control={fvControl}
                errors={errors}
                disabled={isPending}
                onAutoFill={handleFirstAlarmChange}
              />

              <LastAlarmField
                control={fvControl}
                errors={errors}
                disabled={isPending}
                dateError={dateValidation.lastAlarmError}
              />
            </div>
          </FormSection>

          {/* ── Avviso allarme ignorato ── */}
          {ignoredAlarmMatch && (
            <IgnoredAlarmWarningBanner ignoredAlarm={ignoredAlarmMatch} />
          )}

          {/* ── Sezione 2: Dettagli Analisi ── */}
          <FormSection label="Dettagli Analisi" color="blue" icon={FileSearch}>
            <div className="grid gap-4 p-5 sm:grid-cols-2">

              {/* Row 1: Stato + Tipo analisi */}
              <div className="space-y-2">
                <Label>Stato</Label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value || 'CREATED'}
                      onValueChange={field.onChange}
                      disabled={isPending}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ANALYSIS_STATUS_LABELS) as AnalysisStatus[]).map((status) => (
                          <SelectItem key={status} value={status}>
                            {ANALYSIS_STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo analisi</Label>
                <Controller
                  name="analysisType"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value || 'ANALYZABLE'}
                      onValueChange={field.onChange}
                      disabled={isPending}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ANALYSIS_TYPE_LABELS) as AnalysisType[]).map((type) => (
                          <SelectItem key={type} value={type}>
                            {ANALYSIS_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Conditional: Motivo ignora + dettagli dinamici (only for IGNORABLE) */}
              {watchedAnalysisType === 'IGNORABLE' && (
                <>
                  <IgnoreReasonField
                    control={fvControl}
                    disabled={isPending}
                    options={ignoreReasons?.map((r) => ({ value: r.code, label: r.label })) ?? []}
                  />
                  {selectedIgnoreReason?.detailsSchema && (
                    <div className="sm:col-span-2">
                      <DynamicIgnoreDetailsForm
                        control={control}
                        schema={selectedIgnoreReason.detailsSchema}
                        disabled={isPending}
                        errors={errors}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Dettagli errore (full width) */}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="form-error-details">Dettagli errore</Label>
                <Textarea
                  id="form-error-details"
                  placeholder="Descrizione dell'errore..."
                  rows={3}
                  {...register('errorDetails')}
                  disabled={isPending}
                />
              </div>

              {/* ID di Tracciamento (full width) */}
              <TrackingIdsField
                fields={trackingFields}
                append={appendTracking as (value: FieldValues) => void}
                remove={removeTracking}
                register={fvRegister}
                errors={errors}
                disabled={isPending}
              />

              {/* Microservizi (full width) */}
              <div className="space-y-2 sm:col-span-2">
                <Label>Microservizi</Label>
                <Controller
                  name="microserviceIds"
                  control={control}
                  render={({ field }) => (
                    <MultiSelectCombobox
                      options={microservices?.map((ms) => ({ value: ms.id, label: ms.name })) ?? []}
                      value={field.value || []}
                      onValueChange={field.onChange}
                      placeholder="Nessun microservizio disponibile"
                      searchPlaceholder="Cerca microservizio..."
                      emptyMessage="Nessun microservizio trovato."
                      disabled={isPending}
                    />
                  )}
                />
              </div>

              {/* Downstream (full width) */}
              <div className="space-y-2 sm:col-span-2">
                <Label>Downstream</Label>
                <Controller
                  name="downstreamIds"
                  control={control}
                  render={({ field }) => (
                    <MultiSelectCombobox
                      options={downstreams?.map((ds) => ({ value: ds.id, label: ds.name })) ?? []}
                      value={field.value || []}
                      onValueChange={field.onChange}
                      placeholder="Nessun downstream disponibile"
                      searchPlaceholder="Cerca downstream..."
                      emptyMessage="Nessun downstream trovato."
                      disabled={isPending}
                    />
                  )}
                />
              </div>

              {/* Link (full width) */}
              <LinksField
                fields={linkFields}
                append={appendLink as (value: FieldValues) => void}
                remove={removeLink}
                register={fvRegister}
                errors={errors}
                linkUrlValues={watchedLinkUrls}
                disabled={isPending}
              />
            </div>
          </FormSection>

          {/* ── Sezione 3: Conclusioni e azioni finali ── */}
          <FormSection label="Conclusioni e azioni finali" color="emerald" icon={CheckSquare}>
            <div className="space-y-4 p-5">
              {/* Runbook */}
              <div className="space-y-2">
                <Label>Runbook</Label>
                <Controller
                  name="runbookId"
                  control={control}
                  render={({ field }) => (
                    <Combobox
                      options={[
                        { value: NO_VALUE, label: 'Nessuno' },
                        ...(runbooks?.map((rb) => ({
                          value: rb.id,
                          label: rb.status === 'DRAFT' ? `${rb.name} (Bozza)` : rb.name,
                        })) ?? []),
                      ]}
                      value={field.value || NO_VALUE}
                      onValueChange={(val) => field.onChange(val === NO_VALUE || val === '' ? undefined : val)}
                      placeholder="Nessuno"
                      searchPlaceholder="Cerca runbook..."
                      emptyMessage="Nessun runbook trovato."
                      disabled={isPending}
                    />
                  )}
                />
              </div>

              {/* Azioni Finali */}
              <div className="space-y-2">
                <Label>Azioni Finali</Label>
                <Controller
                  name="finalActionIds"
                  control={control}
                  render={({ field }) => (
                    <MultiSelectCombobox
                      options={finalActions?.map((fa) => ({ value: fa.id, label: fa.name })) ?? []}
                      value={field.value || []}
                      onValueChange={field.onChange}
                      placeholder="Nessuna azione finale"
                      searchPlaceholder="Cerca azione finale..."
                      emptyMessage="Nessuna azione finale trovata."
                      disabled={isPending}
                    />
                  )}
                />
              </div>

              {/* Note conclusione */}
              <div className="space-y-2">
                <Label htmlFor="form-conclusion-notes">Note conclusione</Label>
                <Textarea
                  id="form-conclusion-notes"
                  placeholder="Note aggiuntive..."
                  rows={3}
                  {...register('conclusionNotes')}
                  disabled={isPending}
                />
              </div>
            </div>
          </FormSection>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={isPending || hasDateErrors}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editItem ? 'Salva' : 'Crea'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
