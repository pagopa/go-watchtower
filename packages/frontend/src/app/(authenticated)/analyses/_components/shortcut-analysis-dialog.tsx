'use client'

import { useEffect } from 'react'
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
  fromDatetimeLocal,
  toDatetimeLocal,
  type ShortcutInCorsoData,
  type AnalysisFormData,
} from './analysis-form-schemas'
import {
  AlarmField,
  EnvironmentField,
  OccurrencesField,
  FirstAlarmField,
  ProductSelectorCard,
} from './analysis-form-fields'

export interface ShortcutAnalysisDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: AnalysisFormData) => void
  isPending: boolean
  products?: Product[]
  showProductSelector?: boolean
  selectedProductId?: string
  onProductChange?: (productId: string) => void
}

const DEFAULT_VALUES: FieldValues = {
  alarmId: '',
  isOnCall: false,
  occurrences: '' as unknown as number,
  environmentId: '',
  firstAlarmAt: '',
}

const COLORS = {
  border: 'border-amber-500/20 dark:border-amber-500/15',
  headerBg: 'bg-amber-50 dark:bg-amber-950/30',
  headerBorder: 'border-b border-amber-200/60 dark:border-amber-500/15',
  text: 'text-amber-700 dark:text-amber-400',
}

export function ShortcutAnalysisDialog({
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
    formState: { errors },
  } = useForm({
    resolver: zodResolver(shortcutInCorsoSchema),
    defaultValues: DEFAULT_VALUES,
  })

  useEffect(() => {
    if (open) {
      reset(DEFAULT_VALUES)
    }
  }, [open, reset])

  const handleFormSubmit = (data: FieldValues) => {
    const now = toDatetimeLocal(new Date().toISOString())
    const typedData = data as ShortcutInCorsoData
    onSubmit({
      alarmId: typedData.alarmId,
      isOnCall: typedData.isOnCall,
      occurrences: typedData.occurrences,
      environmentId: typedData.environmentId,
      firstAlarmAt: fromDatetimeLocal(typedData.firstAlarmAt),
      lastAlarmAt: fromDatetimeLocal(typedData.firstAlarmAt),
      analysisDate: fromDatetimeLocal(now),
      operatorId: session?.user?.id ?? '',
      status: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuova Analisi — In corso</DialogTitle>
          <DialogDescription>
            Crea rapidamente un&apos;analisi per un allarme attivo. Stato, data analisi e operatore saranno impostati automaticamente.
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

          <div className={cn('overflow-hidden rounded-xl border shadow-sm', COLORS.border)}>
            <div className={cn('flex items-center gap-2.5 px-5 py-3.5', COLORS.headerBg, COLORS.headerBorder)}>
              <Bell className={cn('h-3.5 w-3.5 shrink-0', COLORS.text)} />
              <h3 className={cn('text-xs font-semibold uppercase tracking-widest', COLORS.text)}>
                Informazioni Allarme
              </h3>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <AlarmField
                control={control}
                errors={errors}
                disabled={isPending}
                alarms={alarms}
                showOnCall={true}
              />

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
                showNow
              />
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
