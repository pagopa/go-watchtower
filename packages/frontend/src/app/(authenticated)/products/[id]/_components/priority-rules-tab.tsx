'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray, Controller, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Loader2, X, ChevronDown, ChevronUp, Calendar, Clock } from 'lucide-react'
import { toast } from 'sonner'
import {
  api,
  type Alarm,
  type Environment,
  type AlertPriorityLevel,
  type AlarmPriorityRule,
  type TimeConstraint,
} from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { invalidate } from '@/lib/query-invalidation'
import { usePermissions } from '@/hooks/use-permissions'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'

const timeConstraintSchema = z.object({
  periods: z.array(z.object({
    start: z.string().min(1, 'Data inizio obbligatoria'),
    end: z.string().min(1, 'Data fine obbligatoria'),
  })).optional().default([]),
  weekdays: z.array(z.number().min(0).max(6)).optional().default([]),
  hours: z.array(z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:mm'),
    end: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:mm'),
  })).optional().default([]),
})

const ruleSchema = z.object({
  name: z.string().min(1, 'Nome obbligatorio'),
  priorityCode: z.string().min(1, 'Priority obbligatoria'),
  environmentId: z.string().optional(),
  matcherType: z.enum(['ALARM_ID', 'ALARM_NAME_PREFIX', 'ALARM_NAME_REGEX']),
  alarmId: z.string().optional(),
  namePrefix: z.string().optional(),
  namePattern: z.string().optional(),
  precedence: z.coerce.number().int().default(0),
  note: z.string().optional(),
  isActive: z.boolean(),
  validity: z.array(timeConstraintSchema).default([]),
  exclusions: z.array(timeConstraintSchema).default([]),
}).superRefine((value, ctx) => {
  if (value.matcherType === 'ALARM_ID' && !value.alarmId) {
    ctx.addIssue({ code: 'custom', path: ['alarmId'], message: 'Seleziona un allarme' })
  }
  if (value.matcherType === 'ALARM_NAME_PREFIX' && !value.namePrefix?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['namePrefix'], message: 'Inserisci un prefisso' })
  }
  if (value.matcherType === 'ALARM_NAME_REGEX' && !value.namePattern?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['namePattern'], message: 'Inserisci una regular expression' })
  }
})

type RuleFormData = z.infer<typeof ruleSchema>

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
const PRIORITY_BADGE_CLASS_BY_COLOR: Record<string, string> = {
  zinc: 'border-zinc-500/20 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  slate: 'border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  gray: 'border-gray-500/20 bg-gray-500/10 text-gray-700 dark:text-gray-300',
  neutral: 'border-neutral-500/20 bg-neutral-500/10 text-neutral-700 dark:text-neutral-300',
  stone: 'border-stone-500/20 bg-stone-500/10 text-stone-700 dark:text-stone-300',
  red: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400',
  orange: 'border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-400',
  amber: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  yellow: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  lime: 'border-lime-500/20 bg-lime-500/10 text-lime-700 dark:text-lime-400',
  green: 'border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400',
  emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  teal: 'border-teal-500/20 bg-teal-500/10 text-teal-700 dark:text-teal-400',
  cyan: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
  sky: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400',
  blue: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  indigo: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  violet: 'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-400',
  purple: 'border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-400',
  fuchsia: 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400',
  pink: 'border-pink-500/20 bg-pink-500/10 text-pink-700 dark:text-pink-400',
  rose: 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400',
}

function getPriorityBadgeClass(color: string | null | undefined): string {
  if (!color) {
    return PRIORITY_BADGE_CLASS_BY_COLOR.zinc
  }

  return PRIORITY_BADGE_CLASS_BY_COLOR[color.trim().toLowerCase()] ?? PRIORITY_BADGE_CLASS_BY_COLOR.zinc
}

function toDatetimeLocal(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocal(local: string): string {
  if (!local) return ''
  return new Date(local).toISOString()
}

function mapConstraints(list: RuleFormData['validity']): TimeConstraint[] {
  return list
    .map((constraint) => {
      const result: TimeConstraint = {}
      if (constraint.periods && constraint.periods.length > 0) {
        result.periods = constraint.periods.map((period) => ({
          start: fromDatetimeLocal(period.start),
          end: fromDatetimeLocal(period.end),
        }))
      }
      if (constraint.weekdays && constraint.weekdays.length > 0) {
        result.weekdays = constraint.weekdays
      }
      if (constraint.hours && constraint.hours.length > 0) {
        result.hours = constraint.hours
      }
      return result
    })
    .filter((constraint) => constraint.periods || constraint.weekdays || constraint.hours)
}

function toFormData(rule: AlarmPriorityRule): RuleFormData {
  return {
    name: rule.name,
    priorityCode: rule.priorityCode,
    environmentId: rule.environmentId ?? '',
    matcherType: rule.matcherType,
    alarmId: rule.alarmId ?? '',
    namePrefix: rule.namePrefix ?? '',
    namePattern: rule.namePattern ?? '',
    precedence: rule.precedence,
    note: rule.note ?? '',
    isActive: rule.isActive,
    validity: (rule.validity ?? []).map((constraint) => ({
      periods: (constraint.periods ?? []).map((period) => ({
        start: toDatetimeLocal(period.start),
        end: toDatetimeLocal(period.end),
      })),
      weekdays: constraint.weekdays ?? [],
      hours: constraint.hours ?? [],
    })),
    exclusions: (rule.exclusions ?? []).map((constraint) => ({
      periods: (constraint.periods ?? []).map((period) => ({
        start: toDatetimeLocal(period.start),
        end: toDatetimeLocal(period.end),
      })),
      weekdays: constraint.weekdays ?? [],
      hours: constraint.hours ?? [],
    })),
  }
}

function toApiData(data: RuleFormData) {
  return {
    name: data.name,
    priorityCode: data.priorityCode,
    environmentId: data.environmentId || null,
    matcherType: data.matcherType,
    alarmId: data.matcherType === 'ALARM_ID' ? data.alarmId || null : null,
    namePrefix: data.matcherType === 'ALARM_NAME_PREFIX' ? data.namePrefix || null : null,
    namePattern: data.matcherType === 'ALARM_NAME_REGEX' ? data.namePattern || null : null,
    precedence: data.precedence,
    note: data.note || null,
    isActive: data.isActive,
    validity: mapConstraints(data.validity),
    exclusions: mapConstraints(data.exclusions),
  }
}

const EMPTY_DEFAULTS: RuleFormData = {
  name: '',
  priorityCode: '',
  environmentId: '',
  matcherType: 'ALARM_ID',
  alarmId: '',
  namePrefix: '',
  namePattern: '',
  precedence: 0,
  note: '',
  isActive: true,
  validity: [],
  exclusions: [],
}

function TimeConstraintEditor({
  label,
  fieldArrayName,
  control,
  register,
  disabled,
}: {
  label: string
  fieldArrayName: 'validity' | 'exclusions'
  control: ReturnType<typeof useForm<RuleFormData>>['control']
  register: ReturnType<typeof useForm<RuleFormData>>['register']
  disabled: boolean
}) {
  const { fields, append, remove } = useFieldArray({ control, name: fieldArrayName })
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            append({ periods: [], weekdays: [], hours: [] })
            setExpanded((prev) => ({ ...prev, [fields.length]: true }))
          }}
          disabled={disabled}
        >
          <Plus className="mr-1 h-3 w-3" />
          Aggiungi regola
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="text-xs text-muted-foreground">Nessuna regola configurata</p>
      )}

      {fields.map((field, idx) => (
        <div key={field.id} className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }))}
            >
              {expanded[idx] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Regola {idx + 1}
            </button>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove(idx)} disabled={disabled}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          {expanded[idx] && (
            <TimeConstraintFields
              index={idx}
              fieldArrayName={fieldArrayName}
              control={control}
              register={register}
              disabled={disabled}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function TimeConstraintFields({
  index,
  fieldArrayName,
  control,
  register,
  disabled,
}: {
  index: number
  fieldArrayName: 'validity' | 'exclusions'
  control: ReturnType<typeof useForm<RuleFormData>>['control']
  register: ReturnType<typeof useForm<RuleFormData>>['register']
  disabled: boolean
}) {
  const periodsArray = useFieldArray({ control, name: `${fieldArrayName}.${index}.periods` })
  const hoursArray = useFieldArray({ control, name: `${fieldArrayName}.${index}.hours` })

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Periodi</Label>
          <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => periodsArray.append({ start: '', end: '' })} disabled={disabled}>
            <Plus className="mr-1 h-3 w-3" />
            Periodo
          </Button>
        </div>
        {periodsArray.fields.map((field, pIdx) => (
          <div key={field.id} className="flex items-center gap-2">
            <Input type="datetime-local" className="text-xs" {...register(`${fieldArrayName}.${index}.periods.${pIdx}.start`)} disabled={disabled} />
            <span className="text-xs text-muted-foreground">-</span>
            <Input type="datetime-local" className="text-xs" {...register(`${fieldArrayName}.${index}.periods.${pIdx}.end`)} disabled={disabled} />
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => periodsArray.remove(pIdx)} disabled={disabled}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Giorni della settimana</Label>
        <Controller
          name={`${fieldArrayName}.${index}.weekdays`}
          control={control}
          render={({ field }) => (
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((day, dayIdx) => {
                const selected = (field.value || []).includes(dayIdx)
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={disabled}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                    onClick={() => {
                      const current = field.value || []
                      if (selected) field.onChange(current.filter((item: number) => item !== dayIdx))
                      else field.onChange([...current, dayIdx].sort())
                    }}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          )}
        />
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Fasce orarie</Label>
          <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => hoursArray.append({ start: '08:00', end: '18:00' })} disabled={disabled}>
            <Plus className="mr-1 h-3 w-3" />
            Fascia
          </Button>
        </div>
        {hoursArray.fields.map((field, hIdx) => (
          <div key={field.id} className="flex items-center gap-2">
            <Input type="time" className="text-xs w-28" {...register(`${fieldArrayName}.${index}.hours.${hIdx}.start`)} disabled={disabled} />
            <span className="text-xs text-muted-foreground">-</span>
            <Input type="time" className="text-xs w-28" {...register(`${fieldArrayName}.${index}.hours.${hIdx}.end`)} disabled={disabled} />
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => hoursArray.remove(hIdx)} disabled={disabled}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

interface PriorityRulesTabProps {
  productId: string
}

export function PriorityRulesTab({ productId }: PriorityRulesTabProps) {
  const queryClient = useQueryClient()
  const { can, isLoading: permissionsLoading } = usePermissions()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editItem, setEditItem] = useState<AlarmPriorityRule | null>(null)
  const [deleteItem, setDeleteItem] = useState<AlarmPriorityRule | null>(null)

  const canWrite = !permissionsLoading && can('ALARM_PRIORITY_RULE', 'write')
  const canDelete = !permissionsLoading && can('ALARM_PRIORITY_RULE', 'delete')

  const { data: rules, isLoading, error, refetch } = useQuery({
    queryKey: qk.products.alarmPriorityRules(productId),
    queryFn: () => api.getAlarmPriorityRules(productId),
  })

  const { data: alarms = [] } = useQuery<Alarm[]>({
    queryKey: qk.products.alarms(productId),
    queryFn: () => api.getAlarms(productId),
  })

  const { data: environments = [] } = useQuery<Environment[]>({
    queryKey: qk.products.environments(productId),
    queryFn: () => api.getEnvironments(productId),
  })

  const { data: priorityLevels = [] } = useQuery<AlertPriorityLevel[]>({
    queryKey: qk.priorityLevels.list,
    queryFn: api.getPriorityLevels,
  })

  const form = useForm<RuleFormData>({
    resolver: zodResolver(ruleSchema) as Resolver<RuleFormData>,
    defaultValues: EMPTY_DEFAULTS,
  })

  const { register, handleSubmit, reset, control, watch, formState: { errors, isDirty } } = form
  const matcherType = watch('matcherType')

  const createMutation = useMutation({
    mutationFn: (data: RuleFormData) => api.createAlarmPriorityRule(productId, toApiData(data)),
    onSuccess: () => {
      invalidate(queryClient, 'products', 'alarmEvents', 'analyses')
      toast.success('Regola priority creata e allarmi riallineati')
      setShowCreateDialog(false)
      reset(EMPTY_DEFAULTS)
    },
    onError: (error: Error) => toast.error(error.message || 'Errore durante la creazione'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: RuleFormData }) => api.updateAlarmPriorityRule(productId, id, toApiData(data)),
    onSuccess: () => {
      invalidate(queryClient, 'products', 'alarmEvents', 'analyses')
      toast.success('Regola priority aggiornata e allarmi riallineati')
      setEditItem(null)
      reset(EMPTY_DEFAULTS)
    },
    onError: (error: Error) => toast.error(error.message || 'Errore durante l\'aggiornamento'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteAlarmPriorityRule(productId, id),
    onSuccess: () => {
      invalidate(queryClient, 'products', 'alarmEvents', 'analyses')
      toast.success('Regola priority eliminata e allarmi riallineati')
      setDeleteItem(null)
    },
    onError: (error: Error) => toast.error(error.message || 'Errore durante l\'eliminazione'),
  })

  const isDialogOpen = showCreateDialog || !!editItem
  const isMutating = createMutation.isPending || updateMutation.isPending

  const handleDialogClose = (open: boolean) => {
    if (open) return
    setShowCreateDialog(false)
    setEditItem(null)
    reset(EMPTY_DEFAULTS)
  }

  const onSubmit = (data: RuleFormData) => {
    if (editItem) updateMutation.mutate({ id: editItem.id, data })
    else createMutation.mutate(data)
  }

  if (isLoading && !rules) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
        {Array.from({ length: 3 }, (_, idx) => (
          <div key={idx} className="rounded-lg border p-4 space-y-2">
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-3 w-72" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-4 text-center space-y-2">
        <p className="text-sm text-destructive">Errore durante il caricamento delle regole priority.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Riprova
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground">{rules?.length ?? 0}</span> regole priority
        </span>
        {canWrite && (
          <Button size="sm" onClick={() => { reset(EMPTY_DEFAULTS); setShowCreateDialog(true) }}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nuova
          </Button>
        )}
      </div>

      {rules && rules.length > 0 ? (
        <ul className="space-y-3">
          {rules.map((rule) => (
            <li key={rule.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{rule.name}</span>
                    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${getPriorityBadgeClass(rule.priority.color)}`}>
                      {rule.priority.label}
                    </span>
                    {rule.environment && (
                      <span className="inline-flex items-center rounded border border-border bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground">
                        {rule.environment.name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {rule.matcherType === 'ALARM_ID' && `Allarme catalogato: ${rule.alarm?.name ?? rule.alarmId}`}
                    {rule.matcherType === 'ALARM_NAME_PREFIX' && `Prefisso nome: ${rule.namePrefix}`}
                    {rule.matcherType === 'ALARM_NAME_REGEX' && `Regex nome: ${rule.namePattern}`}
                    <span className="mx-1.5 text-border">·</span>
                    precedence {rule.precedence}
                  </p>
                  {rule.note && <p className="text-xs text-muted-foreground">{rule.note}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${rule.isActive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${rule.isActive ? 'bg-success' : 'bg-muted-foreground/40'}`} />
                    {rule.isActive ? 'Attiva' : 'Inattiva'}
                  </span>
                  {canWrite && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { reset(toFormData(rule)); setEditItem(rule) }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteItem(rule)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>

              {(rule.validity.length > 0 || rule.exclusions.length > 0) && (
                <div className="grid gap-3 md:grid-cols-2">
                  <ConstraintCard label="Validità" constraints={rule.validity} />
                  <ConstraintCard label="Esclusioni" constraints={rule.exclusions} />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">Nessuna regola priority configurata</p>
          <p className="mt-1 text-xs text-muted-foreground/60">Crea la prima regola per assegnare automaticamente una priority agli allarmi.</p>
        </div>
      )}

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => { if (!isDirty || open) handleDialogClose(open) }}
      >
        <DialogContent className="sm:max-w-4xl" isDirty={isDirty} onDirtyClose={() => handleDialogClose(false)}>
          <DialogHeader>
            <DialogTitle>{editItem ? 'Modifica regola priority' : 'Nuova regola priority'}</DialogTitle>
            <DialogDescription>
              Configura matcher, scope e vincoli temporali per assegnare automaticamente una priority agli allarmi.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome regola *</Label>
                <Input {...register('name')} placeholder="es. Reperibilità produzione" />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Priority *</Label>
                <Controller
                  name="priorityCode"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Seleziona priority" /></SelectTrigger>
                      <SelectContent>
                        {priorityLevels.filter((level) => level.isActive).map((level) => (
                          <SelectItem key={level.code} value={level.code}>{level.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.priorityCode && <p className="text-xs text-destructive">{errors.priorityCode.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Ambiente</Label>
                <Controller
                  name="environmentId"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value || '__all__'} onValueChange={(value) => field.onChange(value === '__all__' ? '' : value)}>
                      <SelectTrigger><SelectValue placeholder="Tutti gli ambienti" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Tutti gli ambienti</SelectItem>
                        {environments.map((environment) => (
                          <SelectItem key={environment.id} value={environment.id}>{environment.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Matcher *</Label>
                <Controller
                  name="matcherType"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALARM_ID">Allarme catalogato</SelectItem>
                        <SelectItem value="ALARM_NAME_PREFIX">Prefisso nome allarme</SelectItem>
                        <SelectItem value="ALARM_NAME_REGEX">Regex nome allarme</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {matcherType === 'ALARM_ID' && (
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Allarme *</Label>
                  <Controller
                    name="alarmId"
                    control={control}
                    render={({ field }) => (
                      <Combobox
                        options={alarms.map((alarm) => ({ value: alarm.id, label: alarm.name }))}
                        value={field.value || ''}
                        onValueChange={field.onChange}
                        placeholder="Seleziona allarme"
                        searchPlaceholder="Cerca allarme..."
                        emptyMessage="Nessun allarme trovato."
                        disabled={isMutating}
                      />
                    )}
                  />
                  {errors.alarmId && <p className="text-xs text-destructive">{errors.alarmId.message}</p>}
                </div>
              )}

              {matcherType === 'ALARM_NAME_PREFIX' && (
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Prefisso *</Label>
                  <Input {...register('namePrefix')} placeholder="es. workday-" />
                  {errors.namePrefix && <p className="text-xs text-destructive">{errors.namePrefix.message}</p>}
                </div>
              )}

              {matcherType === 'ALARM_NAME_REGEX' && (
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Regular expression *</Label>
                  <Input {...register('namePattern')} placeholder="es. ^prod-.*-critical$" />
                  {errors.namePattern && <p className="text-xs text-destructive">{errors.namePattern.message}</p>}
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Precedence</Label>
                <Input type="number" {...register('precedence')} />
              </div>

              <div className="space-y-2">
                <Label>Regola attiva</Label>
                <Controller
                  name="isActive"
                  control={control}
                  render={({ field }) => (
                    <div className="flex h-10 items-center">
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </div>
                  )}
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label>Note</Label>
                <Textarea {...register('note')} rows={3} placeholder="Motivazione o contesto operativo della regola" />
              </div>
            </div>

            <Separator />

            <div className="grid gap-5 lg:grid-cols-2">
              <TimeConstraintEditor label="Validità" fieldArrayName="validity" control={control} register={register} disabled={isMutating} />
              <TimeConstraintEditor label="Esclusioni" fieldArrayName="exclusions" control={control} register={register} disabled={isMutating} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleDialogClose(false)} disabled={isMutating}>
                Annulla
              </Button>
              <Button type="submit" disabled={isMutating}>
                {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editItem ? 'Salva modifiche' : 'Crea regola'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteItem}
        onOpenChange={() => setDeleteItem(null)}
        description={`Stai per eliminare la regola "${deleteItem?.name}". Gli eventi impattati verranno riclassificati automaticamente.`}
        onConfirm={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}

function ConstraintCard({ label, constraints }: { label: string; constraints: TimeConstraint[] }) {
  if (!constraints.length) return null

  return (
    <div className="rounded-md border border-border/50 bg-background px-3 py-2.5 space-y-2">
      <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{label}</span>
      {constraints.map((constraint, index) => (
        <div key={index} className="rounded-md border border-border/40 p-2 space-y-1.5">
          {(constraint.periods ?? []).map((period) => (
            <div key={`${period.start}-${period.end}`} className="flex items-center gap-2 text-xs">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <span>{new Date(period.start).toLocaleDateString('it-IT')}</span>
              <span className="text-muted-foreground/50">→</span>
              <span>{new Date(period.end).toLocaleDateString('it-IT')}</span>
            </div>
          ))}
          {(constraint.weekdays ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {constraint.weekdays!.map((day) => (
                <span key={day} className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  {WEEKDAY_LABELS[day]}
                </span>
              ))}
            </div>
          )}
          {(constraint.hours ?? []).map((hours) => (
            <span key={`${hours.start}-${hours.end}`} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground mr-1">
              <Clock className="h-2.5 w-2.5" />
              {hours.start}–{hours.end}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
