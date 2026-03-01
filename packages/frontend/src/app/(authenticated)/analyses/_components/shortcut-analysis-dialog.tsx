'use client'

import { useEffect, useRef } from 'react'
import { useForm, type FieldValues } from 'react-hook-form'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { Bell, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  api,
  type Alarm,
  type Environment,
  type Product,
} from '@/lib/api-client'
import {
  shortcutInCorsoSchema,
  shortcutDisservizioSchema,
  shortcutIgnoreListSchema,
  shortcutNonGestitoSchema,
  fromDatetimeLocal,
  toDatetimeLocal,
  useDateValidation,
  type ShortcutInCorsoData,
  type ShortcutDisservizioData,
  type ShortcutIgnoreListData,
  type ShortcutNonGestitoData,
  type AnalysisFormData,
} from './analysis-form-schemas'
import {
  AlarmField,
  EnvironmentField,
  OccurrencesField,
  FirstAlarmField,
  LastAlarmField,
  IgnoreReasonField,
  HandlerField,
  ProductSelectorCard,
} from './analysis-form-fields'

export type ShortcutDialogVariant = 'in-corso' | 'disservizio' | 'ignore-list' | 'non-gestito'

export interface ShortcutAnalysisDialogProps {
  variant: ShortcutDialogVariant
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: AnalysisFormData) => void
  isPending: boolean
  products?: Product[]
  showProductSelector?: boolean
  selectedProductId?: string
  onProductChange?: (productId: string) => void
}

const DEFAULT_VALUES: Record<ShortcutDialogVariant, FieldValues> = {
  'in-corso': {
    alarmId: '',
    isOnCall: false,
    occurrences: '' as unknown as number,
    environmentId: '',
    firstAlarmAt: '',
  },
  disservizio: {
    alarmId: '',
    analysisType: undefined,
    occurrences: '' as unknown as number,
    environmentId: '',
    firstAlarmAt: '',
    lastAlarmAt: '',
  },
  'ignore-list': {
    alarmId: '',
    occurrences: '' as unknown as number,
    environmentId: '',
    firstAlarmAt: '',
    lastAlarmAt: '',
  },
  'non-gestito': {
    alarmId: '',
    handler: '',
    occurrences: '' as unknown as number,
    environmentId: '',
    firstAlarmAt: '',
    lastAlarmAt: '',
  },
}

const TITLES: Record<ShortcutDialogVariant, string> = {
  'in-corso': 'Nuova Analisi — In corso',
  disservizio: 'Nuova Analisi — Disservizio',
  'ignore-list': 'Nuova Analisi — Ignore list',
  'non-gestito': 'Nuova Analisi — Non gestito',
}

const DESCRIPTIONS: Record<ShortcutDialogVariant, string> = {
  'in-corso': "Crea rapidamente un'analisi per un allarme attivo. Stato, data analisi e operatore saranno impostati automaticamente.",
  disservizio: "Crea rapidamente un'analisi per release o manutenzione. Lo stato sarà impostato automaticamente a \"Completata\".",
  'ignore-list': "Crea rapidamente un'analisi per un allarme in ignore list. Lo stato sarà impostato automaticamente a \"Completata\".",
  'non-gestito': "Crea rapidamente un'analisi per un allarme non gestito dal nostro team. Lo stato sarà impostato automaticamente a \"Completata\".",
}

// --- Per-variant color config ---

type VariantColors = {
  border: string
  headerBg: string
  headerBorder: string
  marker: string
  text: string
}

const VARIANT_COLORS: Record<ShortcutDialogVariant, VariantColors> = {
  'in-corso': {
    border: 'border-amber-500/20 dark:border-amber-500/15',
    headerBg: 'bg-amber-50 dark:bg-amber-950/30',
    headerBorder: 'border-b border-amber-200/60 dark:border-amber-500/15',
    marker: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-400',
  },
  disservizio: {
    border: 'border-rose-500/20 dark:border-rose-500/15',
    headerBg: 'bg-rose-50 dark:bg-rose-950/30',
    headerBorder: 'border-b border-rose-200/60 dark:border-rose-500/15',
    marker: 'bg-rose-500',
    text: 'text-rose-700 dark:text-rose-400',
  },
  'ignore-list': {
    border: 'border-slate-400/25 dark:border-slate-600/25',
    headerBg: 'bg-slate-50 dark:bg-slate-900/40',
    headerBorder: 'border-b border-slate-200/70 dark:border-slate-700/50',
    marker: 'bg-slate-500',
    text: 'text-slate-600 dark:text-slate-400',
  },
  'non-gestito': {
    border: 'border-indigo-500/20 dark:border-indigo-500/15',
    headerBg: 'bg-indigo-50 dark:bg-indigo-950/30',
    headerBorder: 'border-b border-indigo-200/60 dark:border-indigo-500/15',
    marker: 'bg-indigo-500',
    text: 'text-indigo-700 dark:text-indigo-400',
  },
}

function getSchema(variant: ShortcutDialogVariant) {
  switch (variant) {
    case 'in-corso':
      return shortcutInCorsoSchema
    case 'disservizio':
      return shortcutDisservizioSchema
    case 'ignore-list':
      return shortcutIgnoreListSchema
    case 'non-gestito':
      return shortcutNonGestitoSchema
  }
}

function toAnalysisFormData(
  variant: ShortcutDialogVariant,
  rawData: FieldValues,
  operatorId: string
): AnalysisFormData {
  const now = toDatetimeLocal(new Date().toISOString())

  switch (variant) {
    case 'in-corso': {
      const data = rawData as ShortcutInCorsoData
      return {
        alarmId: data.alarmId,
        isOnCall: data.isOnCall,
        occurrences: data.occurrences,
        environmentId: data.environmentId,
        firstAlarmAt: fromDatetimeLocal(data.firstAlarmAt),
        lastAlarmAt: fromDatetimeLocal(data.firstAlarmAt),
        analysisDate: fromDatetimeLocal(now),
        operatorId,
        status: 'IN_PROGRESS',
        analysisType: 'ANALYZABLE',
      }
    }
    case 'disservizio': {
      const data = rawData as ShortcutDisservizioData
      return {
        alarmId: data.alarmId,
        analysisType: 'IGNORABLE',
        ignoreReasonCode: data.ignoreReasonCode,
        occurrences: data.occurrences,
        environmentId: data.environmentId,
        firstAlarmAt: fromDatetimeLocal(data.firstAlarmAt),
        lastAlarmAt: fromDatetimeLocal(data.lastAlarmAt),
        analysisDate: fromDatetimeLocal(now),
        operatorId,
        status: 'COMPLETED',
      }
    }
    case 'ignore-list': {
      const data = rawData as ShortcutIgnoreListData
      return {
        alarmId: data.alarmId,
        occurrences: data.occurrences,
        environmentId: data.environmentId,
        firstAlarmAt: fromDatetimeLocal(data.firstAlarmAt),
        lastAlarmAt: fromDatetimeLocal(data.lastAlarmAt),
        analysisDate: fromDatetimeLocal(now),
        operatorId,
        analysisType: 'IGNORABLE',
        ignoreReasonCode: 'LISTED',
        status: 'COMPLETED',
      }
    }
    case 'non-gestito': {
      const data = rawData as ShortcutNonGestitoData
      return {
        alarmId: data.alarmId,
        occurrences: data.occurrences,
        environmentId: data.environmentId,
        firstAlarmAt: fromDatetimeLocal(data.firstAlarmAt),
        lastAlarmAt: fromDatetimeLocal(data.lastAlarmAt),
        analysisDate: fromDatetimeLocal(now),
        operatorId,
        analysisType: 'IGNORABLE',
        ignoreReasonCode: 'EXTERNAL',
        ignoreDetails: { handler: data.handler },
        status: 'COMPLETED',
      }
    }
  }
}

export function ShortcutAnalysisDialog({
  variant,
  open,
  onOpenChange,
  onSubmit,
  isPending,
  products,
  showProductSelector,
  selectedProductId,
  onProductChange,
}: ShortcutAnalysisDialogProps) {
  const { data: session } = useSession()
  const productId = selectedProductId || ''
  const c = VARIANT_COLORS[variant]

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

  const hasLastAlarm = variant !== 'in-corso'

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(getSchema(variant)),
    defaultValues: DEFAULT_VALUES[variant],
  })

  const lastAlarmAutoFilledRef = useRef(false)

  useEffect(() => {
    if (open) {
      reset(DEFAULT_VALUES[variant])
      lastAlarmAutoFilledRef.current = false
    }
  }, [open, reset, variant])

  const watchedFirstAlarm = watch('firstAlarmAt') as string
  const watchedLastAlarm = watch('lastAlarmAt') as string
  const dateValidation = useDateValidation(
    watchedFirstAlarm,
    watchedLastAlarm,
    ''
  )

  const handleFirstAlarmChange = (value: string, fieldOnChange: (v: string) => void) => {
    fieldOnChange(value)

    if (!hasLastAlarm) {
      return
    }

    if (value && !lastAlarmAutoFilledRef.current && !getValues('lastAlarmAt')) {
      setValue('lastAlarmAt', value)
      lastAlarmAutoFilledRef.current = true
    }
  }

  const handleFormSubmit = (data: FieldValues) => {
    const fullData = toAnalysisFormData(variant, data, session?.user?.id ?? '')
    onSubmit(fullData)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{TITLES[variant]}</DialogTitle>
          <DialogDescription>{DESCRIPTIONS[variant]}</DialogDescription>
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

          {/* Variant-colored section */}
          <div className={cn('overflow-hidden rounded-xl border shadow-sm', c.border)}>
            <div className={cn('flex items-center gap-2.5 px-5 py-3.5', c.headerBg, c.headerBorder)}>
              <Bell className={cn('h-3.5 w-3.5 shrink-0', c.text)} />
              <h3 className={cn('text-xs font-semibold uppercase tracking-widest', c.text)}>
                Informazioni Allarme
              </h3>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <AlarmField
                control={control}
                errors={errors}
                disabled={isPending}
                alarms={alarms}
                showOnCall={variant === 'in-corso'}
              />

              {variant === 'disservizio' && (
                <IgnoreReasonField
                  control={control}
                  disabled={isPending}
                  options={[
                    { value: 'RELEASE', label: 'Release' },
                    { value: 'MAINTENANCE', label: 'Manutenzione pianificata' },
                  ]}
                />
              )}

              {variant === 'non-gestito' && (
                <HandlerField
                  registration={register('handler')}
                  errors={errors}
                  disabled={isPending}
                />
              )}

              <OccurrencesField
                registration={register('occurrences')}
                errors={errors}
                disabled={isPending}
              />

              <EnvironmentField
                control={control}
                errors={errors}
                disabled={isPending}
                environments={environments}
              />

              <FirstAlarmField
                control={control}
                errors={errors}
                disabled={isPending}
                onAutoFill={handleFirstAlarmChange}
              />

              {hasLastAlarm && (
                <LastAlarmField
                  control={control}
                  errors={errors}
                  disabled={isPending}
                  dateError={dateValidation.lastAlarmError}
                />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
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
