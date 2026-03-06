'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm, Controller, type Control, type FieldErrors, type FieldValues } from 'react-hook-form'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { Bell, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  api,
  type Alarm,
  type Environment,
  type IgnoreReason,
  type Product,
} from '@/lib/api-client'
import {
  shortcutIgnorableSchema,
  utcLocalToISO as fromDatetimeLocal,
  isoToUTCLocal as toDatetimeLocal,
  useDateValidation,
  type ShortcutIgnorableData,
  type AnalysisFormData,
} from './analysis-form-schemas'
import {
  AlarmField,
  EnvironmentField,
  OccurrencesField,
  FirstAlarmField,
  LastAlarmField,
  ProductSelectorCard,
} from './analysis-form-fields'
import { DynamicIgnoreDetailsForm } from '@/components/ui/json-schema-form'

export interface ShortcutIgnorableDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: AnalysisFormData) => void
  isPending: boolean
  products?: Product[]
  showProductSelector?: boolean
  selectedProductId?: string
  onProductChange?: (productId: string) => void
}

const DEFAULT_VALUES = {
  alarmId: '',
  occurrences: '' as unknown as number,
  environmentId: '',
  firstAlarmAt: '',
  lastAlarmAt: '',
  ignoreReasonCode: '',
  ignoreDetails: {} as Record<string, unknown>,
}

const ALARM_COLORS = {
  border: 'border-slate-400/25 dark:border-slate-600/25',
  headerBg: 'bg-slate-50 dark:bg-slate-900/40',
  headerBorder: 'border-b border-slate-200/70 dark:border-slate-700/50',
  text: 'text-slate-600 dark:text-slate-400',
}

const REASON_COLORS = {
  border: 'border-rose-500/20 dark:border-rose-500/15',
  headerBg: 'bg-rose-50 dark:bg-rose-950/30',
  headerBorder: 'border-b border-rose-200/60 dark:border-rose-500/15',
  text: 'text-rose-700 dark:text-rose-400',
}

export function ShortcutIgnorableDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  products,
  showProductSelector,
  selectedProductId,
  onProductChange,
}: ShortcutIgnorableDialogProps) {
  const { data: session } = useSession()
  const productId = selectedProductId || ''

  const { data: ignoreReasons } = useQuery<IgnoreReason[]>({
    queryKey: ['ignore-reasons'],
    queryFn: () => api.getIgnoreReasons(),
    enabled: open,
  })

  const { data: alarms } = useQuery<Alarm[]>({
    queryKey: ['products', productId, 'alarms'],
    queryFn: () => api.getAlarms(productId),
    enabled: open && !!productId,
  })

  const { data: environments } = useQuery<Environment[]>({
    queryKey: ['products', productId, 'environments'],
    queryFn: () => api.getEnvironments(productId),
    enabled: open && !!productId,
  })

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    getValues,
    formState: { errors: typedErrors },
  } = useForm({
    resolver: zodResolver(shortcutIgnorableSchema),
    defaultValues: DEFAULT_VALUES,
  })

  // Widen types for polymorphic field components (react-hook-form Control is invariant)
  const fvControl = control as unknown as Control<FieldValues>
  const errors = typedErrors as FieldErrors<FieldValues>

  const [selectedRunbookId, setSelectedRunbookId] = useState<string | null>(null)
  const lastAlarmAutoFilledRef = useRef(false)

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      reset(DEFAULT_VALUES)
      setSelectedRunbookId(null)
      lastAlarmAutoFilledRef.current = false
    }
    onOpenChange(newOpen)
  }, [reset, onOpenChange])

  const watchedIgnoreReasonCode = watch('ignoreReasonCode') as string
  const watchedFirstAlarm = watch('firstAlarmAt') as string
  const watchedLastAlarm = watch('lastAlarmAt') as string
  const dateValidation = useDateValidation(watchedFirstAlarm, watchedLastAlarm, '')

  const selectedReason = ignoreReasons?.find((r) => r.code === watchedIgnoreReasonCode)

  // Reset dynamic details when reason changes (skip initial mount / empty value)
  useEffect(() => {
    if (!watchedIgnoreReasonCode) return
    setValue('ignoreDetails', {})
  }, [watchedIgnoreReasonCode, setValue])

  const handleFirstAlarmChange = (value: string, fieldOnChange: (v: string) => void) => {
    fieldOnChange(value)
    if (value && !lastAlarmAutoFilledRef.current && !getValues('lastAlarmAt')) {
      setValue('lastAlarmAt', value)
      lastAlarmAutoFilledRef.current = true
    }
  }

  const handleFormSubmit = useCallback((data: FieldValues) => {
    const now = toDatetimeLocal(new Date().toISOString())
    const typedData = data as ShortcutIgnorableData
    onSubmit({
      alarmId: typedData.alarmId,
      analysisType: 'IGNORABLE',
      ignoreReasonCode: typedData.ignoreReasonCode,
      ignoreDetails: typedData.ignoreDetails && Object.keys(typedData.ignoreDetails).length > 0
        ? typedData.ignoreDetails
        : undefined,
      occurrences: typedData.occurrences,
      environmentId: typedData.environmentId,
      firstAlarmAt: fromDatetimeLocal(typedData.firstAlarmAt),
      lastAlarmAt: fromDatetimeLocal(typedData.lastAlarmAt),
      analysisDate: fromDatetimeLocal(now),
      operatorId: session?.user?.id ?? '',
      status: 'COMPLETED',
      runbookId: selectedRunbookId || undefined,
    })
  }, [onSubmit, session?.user?.id, selectedRunbookId])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuova Analisi — Da ignorare</DialogTitle>
          <DialogDescription>
            Crea rapidamente un&apos;analisi per un allarme da ignorare. Lo stato sarà impostato automaticamente a &quot;Completata&quot;.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
          {showProductSelector && (
            <ProductSelectorCard
              products={products}
              selectedProductId={selectedProductId || ''}
              onProductChange={(val) => onProductChange?.(val)}
              disabled={isPending}
            />
          )}

          {/* Alarm info section */}
          <div className={cn('overflow-hidden rounded-xl border shadow-sm', ALARM_COLORS.border)}>
            <div className={cn('flex items-center gap-2.5 px-5 py-3.5', ALARM_COLORS.headerBg, ALARM_COLORS.headerBorder)}>
              <Bell className={cn('h-3.5 w-3.5 shrink-0', ALARM_COLORS.text)} />
              <h3 className={cn('text-xs font-semibold uppercase tracking-widest', ALARM_COLORS.text)}>
                Informazioni Allarme
              </h3>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <AlarmField
                control={fvControl}
                errors={errors}
                disabled={isPending}
                alarms={alarms}
                showOnCall={false}
                onAlarmChange={(alarm) => setSelectedRunbookId(alarm.runbookId)}
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
          </div>

          {/* Ignore reason section */}
          <div className={cn('overflow-hidden rounded-xl border shadow-sm', REASON_COLORS.border)}>
            <div className={cn('flex items-center gap-2.5 px-5 py-3.5', REASON_COLORS.headerBg, REASON_COLORS.headerBorder)}>
              <EyeOff className={cn('h-3.5 w-3.5 shrink-0', REASON_COLORS.text)} />
              <h3 className={cn('text-xs font-semibold uppercase tracking-widest', REASON_COLORS.text)}>
                Motivo
              </h3>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Motivo *</Label>
                <Controller
                  name="ignoreReasonCode"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value || ''}
                      onValueChange={field.onChange}
                      disabled={isPending || !ignoreReasons}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={ignoreReasons ? 'Seleziona motivo' : 'Caricamento motivi…'} />
                      </SelectTrigger>
                      <SelectContent>
                        {ignoreReasons?.map((r) => (
                          <SelectItem key={r.code} value={r.code}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.ignoreReasonCode && (
                  <p className="text-sm text-destructive">{errors.ignoreReasonCode.message as string}</p>
                )}
                {selectedReason?.description && (
                  <p className="text-xs text-muted-foreground">{selectedReason.description}</p>
                )}
              </div>

              {selectedReason?.detailsSchema && (
                <div className="sm:col-span-2">
                  <DynamicIgnoreDetailsForm
                    control={fvControl}
                    schema={selectedReason.detailsSchema}
                    disabled={isPending}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    errors={errors as Record<string, any>}
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crea
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
