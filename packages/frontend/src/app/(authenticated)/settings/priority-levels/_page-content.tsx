'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller, type Control, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  BellRing,
  Check,
  ChevronsUpDown,
  Flag,
  Loader2,
  Pencil,
  PhoneCall,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  api,
  type AlertPriorityLevel,
  type CreatePriorityLevelData,
  type UpdatePriorityLevelData,
} from '@/lib/api-client'
import {
  PRIORITY_COLOR_OPTIONS,
  PRIORITY_ICON_OPTIONS,
  getPriorityBadgeClass,
  getPriorityColorOption,
  getPriorityIcon,
  getPriorityIconOption,
  normalizePriorityToken,
} from '@/lib/priority-presentation'
import { qk } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'

const priorityLevelFormSchema = z.object({
  code: z
    .string()
    .min(2, 'Codice obbligatorio')
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Usa solo maiuscole, numeri e underscore'),
  label: z.string().min(1, 'Label obbligatoria'),
  description: z.string().optional(),
  rank: z.coerce.number().int(),
  color: z.string().optional(),
  icon: z.string().optional(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  countsAsOnCall: z.boolean(),
  defaultNotify: z.boolean(),
})

type PriorityLevelFormData = z.infer<typeof priorityLevelFormSchema>
type PriorityBooleanField = keyof Pick<
  PriorityLevelFormData,
  'isActive' | 'isDefault' | 'countsAsOnCall' | 'defaultNotify'
>

const DEFAULT_FORM_VALUES: PriorityLevelFormData = {
  code: '',
  label: '',
  description: '',
  rank: 0,
  color: '',
  icon: '',
  isActive: true,
  isDefault: false,
  countsAsOnCall: false,
  defaultNotify: false,
}

function PriorityAppearanceBadge({
  label,
  color,
  icon,
  muted = false,
}: {
  label: string
  color: string | null | undefined
  icon: string | null | undefined
  muted?: boolean
}) {
  const Icon = getPriorityIcon(icon)

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold',
        getPriorityBadgeClass(color),
        muted && 'opacity-60'
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  )
}

function PriorityFlagList({
  isDefault,
  countsAsOnCall,
  defaultNotify,
  isSystem = false,
}: Pick<AlertPriorityLevel, 'isDefault' | 'countsAsOnCall' | 'defaultNotify' | 'isSystem'>) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {isDefault && <Badge variant="secondary">Default</Badge>}
      {countsAsOnCall && (
        <Badge variant="outline" className="gap-1">
          <PhoneCall className="h-3 w-3" />
          On-call
        </Badge>
      )}
      {defaultNotify && (
        <Badge variant="outline" className="gap-1">
          <BellRing className="h-3 w-3" />
          Notifiche default
        </Badge>
      )}
      {isSystem && <Badge variant="outline">Sistema</Badge>}
    </div>
  )
}

function PriorityColorCombobox({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const normalizedValue = normalizePriorityToken(value)
  const selectedOption = getPriorityColorOption(value)
  const hasCustomToken = Boolean(normalizedValue) && !selectedOption
  const colorOptions = [
    {
      value: '',
      label: 'Automatico',
      description: 'Usa il badge neutro di default',
      dotClassName: 'bg-zinc-400',
    },
    ...PRIORITY_COLOR_OPTIONS,
  ]
  const selectedLabel = selectedOption?.label ?? (hasCustomToken ? `Token custom: ${value}` : 'Automatico')
  const selectedDotClassName = selectedOption?.dotClassName ?? 'bg-zinc-400'

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-10 w-full justify-between px-3"
          >
            <span className="flex min-w-0 items-center gap-2 text-left">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background">
                <span className={cn('h-3 w-3 rounded-full', selectedDotClassName)} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{selectedLabel}</span>
              </span>
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[280px] max-w-[calc(100vw-2rem)] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder="Cerca colore..." />
            <CommandList className="max-h-64">
              <CommandEmpty>Nessun colore trovato.</CommandEmpty>
              <CommandGroup heading="Palette">
                {colorOptions.map((option) => {
                  const isSelected = option.value === normalizedValue || (!normalizedValue && option.value === '')

                  return (
                    <CommandItem
                      key={option.value || '__default__'}
                      value={`${option.value} ${option.label} ${option.description}`.toLowerCase()}
                      onSelect={() => {
                        onChange(option.value)
                        setOpen(false)
                      }}
                      className="gap-2 px-3 py-2"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background">
                        <span className={cn('h-3 w-3 rounded-full', option.dotClassName)} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {option.label}
                      </span>
                      <Check className={cn('h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {hasCustomToken && (
        <p className="text-[11px] text-muted-foreground">
          Token colore corrente personalizzato: <span className="font-mono">{value}</span>.
          Scegli un preset solo se vuoi sostituirlo.
        </p>
      )}
    </div>
  )
}

function PriorityIconCombobox({
  value,
  color,
  onChange,
  disabled,
}: {
  value: string
  color: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const normalizedValue = normalizePriorityToken(value)
  const selectedOption = getPriorityIconOption(value)
  const selectedIcon = getPriorityIcon(value)
  const AutomaticIcon = getPriorityIcon('')
  const hasCustomToken = Boolean(normalizedValue) && !selectedOption
  const SelectedIcon = selectedIcon

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-10 w-full justify-between px-3"
          >
            <span className="flex min-w-0 items-center gap-2 text-left">
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
                  getPriorityBadgeClass(color)
                )}
              >
                <SelectedIcon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {selectedOption?.label ?? (hasCustomToken ? `Token custom: ${value}` : 'Automatico')}
                </span>
              </span>
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[280px] max-w-[calc(100vw-2rem)] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder="Cerca icona..." />
            <CommandList className="max-h-64">
              <CommandEmpty>Nessuna icona trovata.</CommandEmpty>
              <CommandGroup heading="Preset">
                <CommandItem
                  value="automatico default neutro"
                  onSelect={() => {
                    onChange('')
                    setOpen(false)
                  }}
                  className="gap-2 px-3 py-2"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                    <AutomaticIcon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    Automatico
                  </span>
                  <Check className={cn('h-4 w-4', !normalizedValue ? 'opacity-100' : 'opacity-0')} />
                </CommandItem>

                {PRIORITY_ICON_OPTIONS.map((option) => {
                  const isSelected = option.value === normalizedValue

                  return (
                    <CommandItem
                      key={option.value}
                      value={`${option.value} ${option.label} ${option.description}`.toLowerCase()}
                      onSelect={() => {
                        onChange(option.value)
                        setOpen(false)
                      }}
                      className="gap-2 px-3 py-2"
                    >
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
                          isSelected ? getPriorityBadgeClass(color) : 'bg-muted/40'
                        )}
                      >
                        <option.Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {option.label}
                      </span>
                      <Check className={cn('h-4 w-4', isSelected ? 'opacity-100' : 'opacity-0')} />
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

    </div>
  )
}

function PriorityPreviewStrip({
  code,
  label,
  description,
  rank,
  color,
  icon,
  isActive,
  isDefault,
  countsAsOnCall,
  defaultNotify,
}: {
  code: string
  label: string
  description: string
  rank: number
  color: string
  icon: string
  isActive: boolean
  isDefault: boolean
  countsAsOnCall: boolean
  defaultNotify: boolean
}) {
  const normalizedColor = normalizePriorityToken(color)
  const normalizedIcon = normalizePriorityToken(icon)
  const hasDescription = description.trim().length > 0

  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <PriorityAppearanceBadge
          label={label.trim() || 'Nuovo livello'}
          color={color}
          icon={icon}
          muted={!isActive}
        />
        <Badge variant="outline" className="font-mono">
          {code.trim() || 'CODE'}
        </Badge>
        <Badge variant="outline" className="font-mono">
          Rank {Number.isFinite(rank) ? rank : 0}
        </Badge>
        <Badge variant={isActive ? 'secondary' : 'outline'}>
          {isActive ? 'Attiva' : 'Inattiva'}
        </Badge>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <PriorityFlagList
          isDefault={isDefault}
          countsAsOnCall={countsAsOnCall}
          defaultNotify={defaultNotify}
          isSystem={false}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-md border bg-background px-2 py-1 font-mono">
          colore: {normalizedColor || 'default'}
        </span>
        <span className="rounded-md border bg-background px-2 py-1 font-mono">
          icona: {normalizedIcon || 'default'}
        </span>
      </div>

      {hasDescription && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {description.trim()}
        </p>
      )}
    </div>
  )
}

function PriorityLevelDialog({
  open,
  onOpenChange,
  editItem,
  onSave,
  isPending,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  editItem: AlertPriorityLevel | null
  onSave: (data: CreatePriorityLevelData | UpdatePriorityLevelData, code?: string) => void
  isPending: boolean
}) {
  const isEdit = !!editItem

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<PriorityLevelFormData>({
    resolver: zodResolver(priorityLevelFormSchema) as Resolver<PriorityLevelFormData>,
    defaultValues: DEFAULT_FORM_VALUES,
  })

  useEffect(() => {
    if (!open) return

    reset({
      code: editItem?.code ?? DEFAULT_FORM_VALUES.code,
      label: editItem?.label ?? DEFAULT_FORM_VALUES.label,
      description: editItem?.description ?? DEFAULT_FORM_VALUES.description,
      rank: editItem?.rank ?? DEFAULT_FORM_VALUES.rank,
      color: editItem?.color ?? DEFAULT_FORM_VALUES.color,
      icon: editItem?.icon ?? DEFAULT_FORM_VALUES.icon,
      isActive: editItem?.isActive ?? DEFAULT_FORM_VALUES.isActive,
      isDefault: editItem?.isDefault ?? DEFAULT_FORM_VALUES.isDefault,
      countsAsOnCall: editItem?.countsAsOnCall ?? DEFAULT_FORM_VALUES.countsAsOnCall,
      defaultNotify: editItem?.defaultNotify ?? DEFAULT_FORM_VALUES.defaultNotify,
    })
  }, [editItem, open, reset])

  const previewCode = watch('code')
  const previewLabel = watch('label')
  const previewDescription = watch('description')
  const previewRank = watch('rank')
  const previewColor = watch('color')
  const previewIcon = watch('icon')
  const previewIsActive = watch('isActive')
  const previewIsDefault = watch('isDefault')
  const previewCountsAsOnCall = watch('countsAsOnCall')
  const previewDefaultNotify = watch('defaultNotify')

  const handleSave = (data: PriorityLevelFormData) => {
    const payload = {
      label: data.label,
      description: data.description?.trim() ? data.description.trim() : null,
      rank: data.rank,
      color: data.color?.trim() ? data.color.trim() : null,
      icon: data.icon?.trim() ? data.icon.trim() : null,
      isActive: data.isActive,
      isDefault: data.isDefault,
      countsAsOnCall: data.countsAsOnCall,
      defaultNotify: data.defaultNotify,
    }

    if (isEdit) {
      onSave(payload satisfies UpdatePriorityLevelData, editItem!.code)
      return
    }

    onSave({ code: data.code, ...payload } satisfies CreatePriorityLevelData)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        isDirty={isDirty}
        onDirtyClose={() => onOpenChange(false)}
      >
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>{isEdit ? 'Modifica priority' : 'Nuovo livello priority'}</DialogTitle>
          <DialogDescription>
            Dialog compatto con selezione guidata di colore e icona.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleSave)} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <section className="space-y-4 rounded-xl border bg-card/60 p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Identita</h3>
                <p className="text-xs text-muted-foreground">
                  Codice, etichetta e ordine con cui il livello viene applicato.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="priority-code">Codice *</Label>
                  <Input
                    id="priority-code"
                    placeholder="es. BUSINESS_CRITICAL"
                    {...register('code')}
                    disabled={isEdit}
                    className={isEdit ? 'font-mono text-muted-foreground' : 'font-mono'}
                  />
                  {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="priority-label">Label *</Label>
                  <Input
                    id="priority-label"
                    placeholder="es. Business Critical"
                    {...register('label')}
                  />
                  {errors.label && <p className="text-xs text-destructive">{errors.label.message}</p>}
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="priority-description">Descrizione</Label>
                  <Textarea
                    id="priority-description"
                    rows={3}
                    placeholder="Quando usare questa priority e cosa comunica operativamente"
                    {...register('description')}
                  />
                </div>

                <div className="space-y-1.5 sm:max-w-[180px]">
                  <Label htmlFor="priority-rank">Rank</Label>
                  <Input id="priority-rank" type="number" {...register('rank')} />
                  <p className="text-xs text-muted-foreground">
                    Valori più alti vincono a parita di matcher.
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border bg-card/60 p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Aspetto</h3>
                <p className="text-xs text-muted-foreground">
                  Selezione rapida del badge con anteprima immediata.
                </p>
              </div>

              <PriorityPreviewStrip
                code={previewCode ?? ''}
                label={previewLabel ?? ''}
                description={previewDescription ?? ''}
                rank={typeof previewRank === 'number' && Number.isFinite(previewRank) ? previewRank : 0}
                color={previewColor ?? ''}
                icon={previewIcon ?? ''}
                isActive={previewIsActive ?? true}
                isDefault={previewIsDefault ?? false}
                countsAsOnCall={previewCountsAsOnCall ?? false}
                defaultNotify={previewDefaultNotify ?? false}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Colore badge</Label>
                  <Controller
                    name="color"
                    control={control}
                    render={({ field }) => (
                      <PriorityColorCombobox
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        disabled={isPending}
                      />
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Icona badge</Label>
                  <Controller
                    name="icon"
                    control={control}
                    render={({ field }) => (
                      <PriorityIconCombobox
                        value={field.value ?? ''}
                        color={previewColor ?? ''}
                        onChange={field.onChange}
                        disabled={isPending}
                      />
                    )}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border bg-card/60 p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Comportamento operativo</h3>
                <p className="text-xs text-muted-foreground">
                  Default, report on-call e notifiche.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <SwitchField
                  control={control}
                  name="isActive"
                  label="Livello attivo"
                  description="Disponibile nelle regole e nei filtri."
                />
                <SwitchField
                  control={control}
                  name="isDefault"
                  label="Default"
                  description="Usato quando nessuna regola matcha."
                />
                <SwitchField
                  control={control}
                  name="countsAsOnCall"
                  label="Conta come on-call"
                  description="Influenza report e classificazioni on-call."
                />
                <SwitchField
                  control={control}
                  name="defaultNotify"
                  label="Notifica di default"
                  description="Abilitato di default nelle preferenze utente."
                />
              </div>
            </section>
          </div>

          <DialogFooter className="border-t px-5 py-4">
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
              {isEdit ? 'Salva modifiche' : 'Crea livello'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SwitchField({
  control,
  name,
  label,
  description,
}: {
  control: Control<PriorityLevelFormData>
  name: PriorityBooleanField
  label: string
  description: string
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <div className="flex items-center justify-between rounded-xl border px-3 py-3">
          <div className="min-w-0 pr-4">
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <Switch checked={field.value} onCheckedChange={field.onChange} />
        </div>
      )}
    />
  )
}

export function PriorityLevelsPage() {
  const queryClient = useQueryClient()
  const { can, isLoading: permissionsLoading } = usePermissions()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<AlertPriorityLevel | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AlertPriorityLevel | null>(null)

  const canWrite = !permissionsLoading && can('PRIORITY_LEVEL', 'write')
  const canDelete = !permissionsLoading && can('PRIORITY_LEVEL', 'delete')

  const { data: priorityLevels, isLoading, refetch, error } = useQuery({
    queryKey: qk.priorityLevels.list,
    queryFn: api.getPriorityLevels,
  })

  const invalidateRelatedQueries = () => {
    queryClient.invalidateQueries({ queryKey: qk.priorityLevels.root })
    queryClient.invalidateQueries({ queryKey: qk.alarmEvents.root })
    queryClient.invalidateQueries({ queryKey: qk.analyses.root })
    queryClient.invalidateQueries({ queryKey: qk.products.root })
  }

  const createMutation = useMutation({
    mutationFn: (data: CreatePriorityLevelData) => api.createPriorityLevel(data),
    onSuccess: () => {
      invalidateRelatedQueries()
      setDialogOpen(false)
      toast.success('Livello priority creato')
    },
    onError: (error: Error) => toast.error(error.message || 'Errore durante la creazione'),
  })

  const updateMutation = useMutation({
    mutationFn: ({
      code,
      data,
    }: {
      code: string
      data: UpdatePriorityLevelData
    }) => api.updatePriorityLevel(code, data),
    onSuccess: () => {
      invalidateRelatedQueries()
      setDialogOpen(false)
      setEditItem(null)
      toast.success('Livello priority aggiornato')
    },
    onError: (error: Error) => toast.error(error.message || 'Errore durante il salvataggio'),
  })

  const deleteMutation = useMutation({
    mutationFn: (code: string) => api.deletePriorityLevel(code),
    onSuccess: () => {
      invalidateRelatedQueries()
      setDeleteTarget(null)
      toast.success('Livello priority eliminato')
    },
    onError: (error: Error) => toast.error(error.message || 'Impossibile eliminare il livello'),
  })

  const handleSave = (data: CreatePriorityLevelData | UpdatePriorityLevelData, code?: string) => {
    if (code) {
      updateMutation.mutate({ code, data: data as UpdatePriorityLevelData })
      return
    }

    createMutation.mutate(data as CreatePriorityLevelData)
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">Priority allarmi</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Catalogo centralizzato dei livelli di priority usati dalle regole di classificazione degli allarmi.
          </p>
        </div>
        {canWrite && (
          <Button
            onClick={() => {
              setEditItem(null)
              setDialogOpen(true)
            }}
            className="shrink-0"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuovo livello
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
        Le modifiche ai livelli impattano etichette, notifiche e aggregazioni on-call.
        Gli eventi storici mantengono la priority materializzata finché non vengono riclassificati.
      </div>

      {isLoading ? (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Livello</TableHead>
                <TableHead className="w-24">Rank</TableHead>
                <TableHead>Flag</TableHead>
                <TableHead className="w-24">Stato</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 4 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-56" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : error ? (
        <div className="space-y-3 rounded-xl border p-8 text-center">
          <p className="text-sm text-destructive">
            Errore durante il caricamento dei livelli priority.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Riprova
          </Button>
        </div>
      ) : !priorityLevels?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <Flag className="mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Nessun livello configurato</p>
          <p className="mt-1 text-xs text-muted-foreground/60">Crea il primo livello priority.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Livello</TableHead>
                <TableHead className="w-20 text-center">Rank</TableHead>
                <TableHead>Flag</TableHead>
                <TableHead className="w-24 text-center">Stato</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {priorityLevels.map((level) => (
                <TableRow key={level.code} className="group">
                  <TableCell className="py-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <PriorityAppearanceBadge
                          label={level.label}
                          color={level.color}
                          icon={level.icon}
                          muted={!level.isActive}
                        />
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {level.code}
                        </span>
                      </div>
                      {level.description && (
                        <p className="max-w-2xl text-xs text-muted-foreground">{level.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm">{level.rank}</TableCell>
                  <TableCell>
                    <PriorityFlagList
                      isDefault={level.isDefault}
                      countsAsOnCall={level.countsAsOnCall}
                      defaultNotify={level.defaultNotify}
                      isSystem={level.isSystem}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={level.isActive ? 'secondary' : 'outline'}>
                      {level.isActive ? 'Attiva' : 'Inattiva'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {canWrite && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditItem(level)
                            setDialogOpen(true)
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && !level.isSystem && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setDeleteTarget(level)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PriorityLevelDialog
        open={dialogOpen}
        onOpenChange={(nextOpen) => {
          setDialogOpen(nextOpen)
          if (!nextOpen) setEditItem(null)
        }}
        editItem={editItem}
        onSave={handleSave}
        isPending={isPending}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        description={`Stai per eliminare il livello "${deleteTarget?.label}". L'operazione è consentita solo se non esistono regole o eventi che lo referenziano.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.code)}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}
