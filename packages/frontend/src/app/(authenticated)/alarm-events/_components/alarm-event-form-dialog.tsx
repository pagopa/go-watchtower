'use client'

import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DateTimePicker } from '@/components/ui/date-time-picker'
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
import { api, type AlarmEvent, type CreateAlarmEventData, type UpdateAlarmEventData } from '@/lib/api-client'

const NO_VALUE = '__none__'

export interface AlarmEventFormData {
  name: string
  firedAt: string
  productId: string
  environmentId: string
  awsRegion: string
  awsAccountId: string
  description: string
  reason: string
}

interface AlarmEventFormDialogProps {
  open: boolean
  editEvent?: AlarmEvent | null
  onClose: () => void
  onSubmit: (data: CreateAlarmEventData | UpdateAlarmEventData, id?: string) => Promise<void>
  isSubmitting?: boolean
}

export function AlarmEventFormDialog({
  open,
  editEvent,
  onClose,
  onSubmit,
  isSubmitting,
}: AlarmEventFormDialogProps) {
  const isEdit = !!editEvent

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<AlarmEventFormData>({
    defaultValues: {
      name: '',
      firedAt: '',
      productId: '',
      environmentId: '',
      awsRegion: '',
      awsAccountId: '',
      description: '',
      reason: '',
    },
  })

  // Populate form when editing
  useEffect(() => {
    if (open) {
      if (editEvent) {
        reset({
          name:         editEvent.name,
          firedAt:      editEvent.firedAt,
          productId:    editEvent.product.id,
          environmentId: editEvent.environment.id,
          awsRegion:    editEvent.awsRegion,
          awsAccountId: editEvent.awsAccountId,
          description:  editEvent.description ?? '',
          reason:       editEvent.reason ?? '',
        })
      } else {
        reset({
          name: '',
          firedAt: '',
          productId: '',
          environmentId: '',
          awsRegion: '',
          awsAccountId: '',
          description: '',
          reason: '',
        })
      }
    }
  }, [open, editEvent, reset])

  const selectedProductId = watch('productId')

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: api.getProducts,
    enabled: open,
  })

  const { data: environments } = useQuery({
    queryKey: ['products', selectedProductId, 'environments'],
    queryFn: () => api.getEnvironments(selectedProductId),
    enabled: open && !!selectedProductId,
  })

  // DateTimePicker emits "YYYY-MM-DDTHH:mm" — append seconds+Z to get a valid ISO 8601 datetime.
  const toISODateTime = (val: string): string => new Date(val + ':00.000Z').toISOString()

  const handleFormSubmit = async (data: AlarmEventFormData) => {
    if (isEdit && editEvent) {
      const payload: UpdateAlarmEventData = {
        description: data.description || null,
        reason:      data.reason || null,
      }
      await onSubmit(payload, editEvent.id)
    } else {
      const payload: CreateAlarmEventData = {
        name:          data.name,
        firedAt:       toISODateTime(data.firedAt),
        productId:     data.productId,
        environmentId: data.environmentId,
        awsRegion:     data.awsRegion,
        awsAccountId:  data.awsAccountId,
        description:   data.description || null,
        reason:        data.reason || null,
      }
      await onSubmit(payload)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Modifica allarme scattato' : 'Nuovo allarme scattato'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Aggiorna descrizione e ragione. I campi AWS e il nome sono immutabili.'
              : 'Inserisci i dettagli dell\'allarme scattato.'}
          </DialogDescription>
        </DialogHeader>

        <form id="alarm-event-form" onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">

          {/* Nome — immutable in edit */}
          <div className="space-y-2">
            <Label htmlFor="ae-name">
              Nome allarme <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ae-name"
              placeholder="Nome dell'allarme CloudWatch..."
              disabled={isEdit}
              {...register('name', { required: !isEdit ? 'Il nome è obbligatorio' : false })}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          {/* Fired At — immutable in edit */}
          <div className="space-y-2">
            <Label>
              Data e ora scatto (UTC) <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="firedAt"
              control={control}
              rules={{ required: !isEdit ? 'La data è obbligatoria' : false }}
              render={({ field }) => (
                <DateTimePicker
                  value={field.value}
                  onChange={(v) => field.onChange(v ?? '')}
                  disabled={isEdit}
                />
              )}
            />
            {errors.firedAt && <p className="text-xs text-destructive">{errors.firedAt.message}</p>}
          </div>

          {/* Product — immutable in edit */}
          <div className="space-y-2">
            <Label>
              Prodotto <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="productId"
              control={control}
              rules={{ required: !isEdit ? 'Il prodotto è obbligatorio' : false }}
              render={({ field }) => (
                <Select
                  value={field.value || NO_VALUE}
                  onValueChange={(v) => field.onChange(v === NO_VALUE ? '' : v)}
                  disabled={isEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona prodotto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.productId && <p className="text-xs text-destructive">{errors.productId.message}</p>}
          </div>

          {/* Environment — immutable in edit */}
          <div className="space-y-2">
            <Label>
              Ambiente <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="environmentId"
              control={control}
              rules={{ required: !isEdit ? 'L\'ambiente è obbligatorio' : false }}
              render={({ field }) => (
                <Select
                  value={field.value || NO_VALUE}
                  onValueChange={(v) => field.onChange(v === NO_VALUE ? '' : v)}
                  disabled={isEdit || !selectedProductId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={selectedProductId ? 'Seleziona ambiente...' : 'Seleziona prima il prodotto'} />
                  </SelectTrigger>
                  <SelectContent>
                    {environments?.map((env) => (
                      <SelectItem key={env.id} value={env.id}>{env.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.environmentId && <p className="text-xs text-destructive">{errors.environmentId.message}</p>}
          </div>

          {/* AWS Region — immutable in edit */}
          <div className="space-y-2">
            <Label htmlFor="ae-region">
              Region AWS <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ae-region"
              placeholder="eu-south-1"
              disabled={isEdit}
              className="font-mono"
              {...register('awsRegion', { required: !isEdit ? 'La region è obbligatoria' : false })}
            />
            {errors.awsRegion && <p className="text-xs text-destructive">{errors.awsRegion.message}</p>}
          </div>

          {/* AWS Account ID — immutable in edit */}
          <div className="space-y-2">
            <Label htmlFor="ae-account">
              Account ID AWS <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ae-account"
              placeholder="123456789012"
              disabled={isEdit}
              className="font-mono"
              {...register('awsAccountId', { required: !isEdit ? 'L\'account ID è obbligatorio' : false })}
            />
            {errors.awsAccountId && <p className="text-xs text-destructive">{errors.awsAccountId.message}</p>}
          </div>

          {/* Description — editable */}
          <div className="space-y-2">
            <Label htmlFor="ae-description">Descrizione</Label>
            <Textarea
              id="ae-description"
              placeholder="Descrizione dell'allarme..."
              rows={3}
              {...register('description')}
            />
          </div>

          {/* Reason — editable */}
          <div className="space-y-2">
            <Label htmlFor="ae-reason">Ragione</Label>
            <Textarea
              id="ae-reason"
              placeholder="Ragione per cui è scattato..."
              rows={3}
              {...register('reason')}
            />
          </div>

        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Annulla
          </Button>
          <Button type="submit" form="alarm-event-form" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Salva modifiche' : 'Crea allarme'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
