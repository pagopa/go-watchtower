'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray, Controller, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Loader2, X, ChevronDown, ChevronUp, BellOff, Calendar, Clock } from 'lucide-react'
import { toast } from 'sonner'
import {
  api,
  type Alarm,
  type Environment,
  type IgnoredAlarm,
  type TimeConstraint,
} from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { usePermissions } from '@/hooks/use-permissions'
import { Button } from '@/components/ui/button'
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

// ============================================================================
// Schema
// ============================================================================

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

const ignoredAlarmSchema = z.object({
  alarmId: z.string().min(1, 'Allarme obbligatorio'),
  environmentId: z.string().min(1, 'Ambiente obbligatorio'),
  reason: z.string().optional(),
  isActive: z.boolean(),
  validity: z.array(timeConstraintSchema).default([]),
  exclusions: z.array(timeConstraintSchema).default([]),
})

type IgnoredAlarmFormData = z.infer<typeof ignoredAlarmSchema>

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
const WEEKDAY_SINGLE = ['D', 'L', 'M', 'M', 'G', 'V', 'S']

// ============================================================================
// Helpers
// ============================================================================

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

function formatPeriodDate(dateStr: string): string {
  if (!dateStr) return '?'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function formDataFromIgnoredAlarm(item: IgnoredAlarm): IgnoredAlarmFormData {
  return {
    alarmId: item.alarmId,
    environmentId: item.environmentId,
    reason: item.reason || '',
    isActive: item.isActive,
    validity: (item.validity || []).map(c => ({
      periods: (c.periods || []).map(p => ({
        start: toDatetimeLocal(p.start),
        end: toDatetimeLocal(p.end),
      })),
      weekdays: c.weekdays || [],
      hours: c.hours || [],
    })),
    exclusions: (item.exclusions || []).map(c => ({
      periods: (c.periods || []).map(p => ({
        start: toDatetimeLocal(p.start),
        end: toDatetimeLocal(p.end),
      })),
      weekdays: c.weekdays || [],
      hours: c.hours || [],
    })),
  }
}

function formDataToApi(data: IgnoredAlarmFormData) {
  const mapConstraints = (list: IgnoredAlarmFormData['validity']) =>
    list
      .map(c => {
        const constraint: TimeConstraint = {}
        if (c.periods && c.periods.length > 0) {
          constraint.periods = c.periods.map(p => ({
            start: fromDatetimeLocal(p.start),
            end: fromDatetimeLocal(p.end),
          }))
        }
        if (c.weekdays && c.weekdays.length > 0) {
          constraint.weekdays = c.weekdays
        }
        if (c.hours && c.hours.length > 0) {
          constraint.hours = c.hours
        }
        return constraint
      })
      .filter(c => c.periods || c.weekdays || c.hours)

  return {
    alarmId: data.alarmId,
    environmentId: data.environmentId,
    reason: data.reason || null,
    isActive: data.isActive,
    validity: mapConstraints(data.validity),
    exclusions: mapConstraints(data.exclusions),
  }
}

const EMPTY_DEFAULTS: IgnoredAlarmFormData = {
  alarmId: '',
  environmentId: '',
  reason: '',
  isActive: true,
  validity: [],
  exclusions: [],
}

// ============================================================================
// Display-only components for constraint visualization
// ============================================================================

function WeekdayPills({ activeDays }: { activeDays: number[] }) {
  return (
    <div className="flex gap-1">
      {WEEKDAY_SINGLE.map((label, idx) => {
        const isActive = activeDays.includes(idx)
        return (
          <span
            key={WEEKDAY_LABELS[idx]}
            title={WEEKDAY_LABELS[idx]}
            className={`inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold transition-colors select-none ${
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/60 text-muted-foreground/30'
            }`}
          >
            {label}
          </span>
        )
      })}
    </div>
  )
}

function ConstraintRuleDisplay({ constraint, index }: { constraint: TimeConstraint; index: number }) {
  const hasPeriods = (constraint.periods?.length ?? 0) > 0
  const hasWeekdays = (constraint.weekdays?.length ?? 0) > 0
  const hasHours = (constraint.hours?.length ?? 0) > 0

  if (!hasPeriods && !hasWeekdays && !hasHours) return null

  return (
    <div className="rounded-md border border-border/50 bg-background px-3 py-2.5 space-y-2.5">
      <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
        Regola {index + 1}
      </span>

      {hasPeriods && (
        <div className="space-y-1.5">
          {constraint.periods!.map((p) => (
            <div key={`${p.start}-${p.end}`} className="flex items-center gap-2 text-xs">
              <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="font-medium tabular-nums">{formatPeriodDate(p.start)}</span>
              <span className="text-muted-foreground/50">→</span>
              <span className="font-medium tabular-nums">{formatPeriodDate(p.end)}</span>
            </div>
          ))}
        </div>
      )}

      {hasWeekdays && (
        <WeekdayPills activeDays={constraint.weekdays!} />
      )}

      {hasHours && (
        <div className="flex flex-wrap gap-1">
          {constraint.hours!.map((h) => (
            <span
              key={`${h.start}-${h.end}`}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground"
            >
              <Clock className="h-2.5 w-2.5 shrink-0" />
              {h.start}–{h.end}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function ConstraintSection({
  label,
  constraints,
  dotClass,
  emptyLabel,
}: {
  label: string
  constraints: TimeConstraint[]
  dotClass: string
  emptyLabel: string
}) {
  const hasContent = constraints.some(
    c => (c.periods?.length ?? 0) > 0 || (c.weekdays?.length ?? 0) > 0 || (c.hours?.length ?? 0) > 0
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          {label}
        </span>
      </div>
      {hasContent ? (
        <div className="space-y-1.5">
          {constraints.map((c, i) => (
            <ConstraintRuleDisplay key={JSON.stringify(c)} constraint={c} index={i} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/40 italic">{emptyLabel}</p>
      )}
    </div>
  )
}

// ============================================================================
// TimeConstraint Editor (for the form dialog — unchanged)
// ============================================================================

function TimeConstraintEditor({
  label,
  fieldArrayName,
  control,
  register,
  disabled,
}: {
  label: string
  fieldArrayName: 'validity' | 'exclusions'
  control: ReturnType<typeof useForm<IgnoredAlarmFormData>>['control']
  register: ReturnType<typeof useForm<IgnoredAlarmFormData>>['register']
  disabled: boolean
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: fieldArrayName,
  })
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
            setExpanded(prev => ({ ...prev, [fields.length]: true }))
          }}
          disabled={disabled}
        >
          <Plus className="mr-1 h-3 w-3" />
          Aggiungi regola
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="text-xs text-muted-foreground">Nessuna regola configurata (sempre valido)</p>
      )}

      {fields.map((field, idx) => (
        <div key={field.id} className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded(prev => ({ ...prev, [idx]: !prev[idx] }))}
            >
              {expanded[idx] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Regola {idx + 1}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => remove(idx)}
              disabled={disabled}
            >
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
  control: ReturnType<typeof useForm<IgnoredAlarmFormData>>['control']
  register: ReturnType<typeof useForm<IgnoredAlarmFormData>>['register']
  disabled: boolean
}) {
  const periodsArray = useFieldArray({
    control,
    name: `${fieldArrayName}.${index}.periods`,
  })
  const hoursArray = useFieldArray({
    control,
    name: `${fieldArrayName}.${index}.hours`,
  })

  return (
    <div className="space-y-4">
      {/* Periods */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Periodi</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => periodsArray.append({ start: '', end: '' })}
            disabled={disabled}
          >
            <Plus className="mr-1 h-3 w-3" />
            Periodo
          </Button>
        </div>
        {periodsArray.fields.map((pField, pIdx) => (
          <div key={pField.id} className="flex items-center gap-2">
            <Input
              type="datetime-local"
              className="text-xs"
              {...register(`${fieldArrayName}.${index}.periods.${pIdx}.start`)}
              disabled={disabled}
            />
            <span className="text-xs text-muted-foreground shrink-0">-</span>
            <Input
              type="datetime-local"
              className="text-xs"
              {...register(`${fieldArrayName}.${index}.periods.${pIdx}.end`)}
              disabled={disabled}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => periodsArray.remove(pIdx)}
              disabled={disabled}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      <Separator />

      {/* Weekdays */}
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
                    key={dayIdx}
                    type="button"
                    disabled={disabled}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                    onClick={() => {
                      const current = field.value || []
                      if (selected) {
                        field.onChange(current.filter((d: number) => d !== dayIdx))
                      } else {
                        field.onChange([...current, dayIdx].sort())
                      }
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

      {/* Hours */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Fasce orarie</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => hoursArray.append({ start: '08:00', end: '18:00' })}
            disabled={disabled}
          >
            <Plus className="mr-1 h-3 w-3" />
            Fascia
          </Button>
        </div>
        {hoursArray.fields.map((hField, hIdx) => (
          <div key={hField.id} className="flex items-center gap-2">
            <Input
              type="time"
              className="text-xs w-28"
              {...register(`${fieldArrayName}.${index}.hours.${hIdx}.start`)}
              disabled={disabled}
            />
            <span className="text-xs text-muted-foreground shrink-0">-</span>
            <Input
              type="time"
              className="text-xs w-28"
              {...register(`${fieldArrayName}.${index}.hours.${hIdx}.end`)}
              disabled={disabled}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => hoursArray.remove(hIdx)}
              disabled={disabled}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Main Tab
// ============================================================================

interface IgnoredAlarmsTabProps {
  productId: string
}

export function IgnoredAlarmsTab({ productId }: IgnoredAlarmsTabProps) {
  const queryClient = useQueryClient()
  const { can, isLoading: permissionsLoading } = usePermissions()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editItem, setEditItem] = useState<IgnoredAlarm | null>(null)
  const [deleteItem, setDeleteItem] = useState<IgnoredAlarm | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const canWrite = !permissionsLoading && can('IGNORED_ALARM', 'write')
  const canDelete = !permissionsLoading && can('IGNORED_ALARM', 'delete')

  const { data: ignoredAlarms, isLoading, error } = useQuery<IgnoredAlarm[]>({
    queryKey: qk.products.ignoredAlarms(productId),
    queryFn: () => api.getIgnoredAlarms(productId),
  })

  const { data: alarms } = useQuery<Alarm[]>({
    queryKey: qk.products.alarms(productId),
    queryFn: () => api.getAlarms(productId),
  })

  const { data: environments } = useQuery<Environment[]>({
    queryKey: qk.products.environments(productId),
    queryFn: () => api.getEnvironments(productId),
  })

  const form = useForm<IgnoredAlarmFormData>({
    resolver: zodResolver(ignoredAlarmSchema) as Resolver<IgnoredAlarmFormData>,
    defaultValues: EMPTY_DEFAULTS,
  })

  const { register, handleSubmit, reset, control, formState: { errors, isDirty } } = form

  const handleEdit = (item: IgnoredAlarm) => {
    reset(formDataFromIgnoredAlarm(item))
    setEditItem(item)
  }

  const createMutation = useMutation({
    mutationFn: (data: IgnoredAlarmFormData) =>
      api.createIgnoredAlarm(productId, formDataToApi(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.products.ignoredAlarms(productId) })
      toast.success('Allarme ignorato creato con successo')
      setShowCreateDialog(false)
      reset(EMPTY_DEFAULTS)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante la creazione')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: IgnoredAlarmFormData }) =>
      api.updateIgnoredAlarm(productId, id, formDataToApi(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.products.ignoredAlarms(productId) })
      toast.success('Allarme ignorato aggiornato con successo')
      setEditItem(null)
      reset(EMPTY_DEFAULTS)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Errore durante l'aggiornamento")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteIgnoredAlarm(productId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.products.ignoredAlarms(productId) })
      toast.success('Allarme ignorato eliminato con successo')
      setDeleteItem(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Errore durante l'eliminazione")
    },
  })

  const isDialogOpen = showCreateDialog || !!editItem
  const isMutating = createMutation.isPending || updateMutation.isPending

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setShowCreateDialog(false)
      setEditItem(null)
      reset(EMPTY_DEFAULTS)
    }
  }

  const onSubmit = (data: IgnoredAlarmFormData) => {
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((n) => (
            <div key={`skeleton-${n}`} className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/5 opacity-60" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="grid grid-cols-2 divide-x divide-border/60 px-0 py-0">
                <div className="p-3 space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-16 w-full rounded-md opacity-50" />
                </div>
                <div className="p-3 space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-10 w-full rounded-md opacity-50" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <p className="py-4 text-sm text-destructive">
        Errore durante il caricamento degli allarmi ignorati.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground">{ignoredAlarms?.length ?? 0}</span>
          {' '}allarmi ignorati
        </span>
        {canWrite && (
          <Button
            size="sm"
            onClick={() => {
              reset(EMPTY_DEFAULTS)
              setShowCreateDialog(true)
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Nuovo
          </Button>
        )}
      </div>

      {/* Card list */}
      {ignoredAlarms && ignoredAlarms.length > 0 ? (
        <ul className="space-y-3">
          {ignoredAlarms.map((ia) => {
            const hasValidity = (ia.validity?.length ?? 0) > 0
            const hasExclusions = (ia.exclusions?.length ?? 0) > 0
            const hasConstraints = hasValidity || hasExclusions
            const isExpanded = expandedIds.has(ia.id)

            const validityCount = ia.validity?.length ?? 0
            const exclusionCount = ia.exclusions?.length ?? 0

            return (
              <li key={ia.id} className="rounded-lg border border-border bg-card overflow-hidden">
                {/* Card header */}
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{ia.alarm.name}</span>
                      <span className="inline-flex items-center rounded border border-border bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground">
                        {ia.environment.name}
                      </span>
                    </div>
                    {ia.reason && (
                      <p className="mt-1 text-xs text-muted-foreground">{ia.reason}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                        ia.isActive
                          ? 'bg-success/10 text-success'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${ia.isActive ? 'bg-success' : 'bg-muted-foreground/40'}`}
                      />
                      {ia.isActive ? 'Attivo' : 'Inattivo'}
                    </span>
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleEdit(ia)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setDeleteItem(ia)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Collapsible constraint toggle bar */}
                {hasConstraints && (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(ia.id)}
                    className="w-full flex items-center justify-between gap-3 border-t border-border/60 bg-muted/10 px-4 py-1.5 text-left hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {hasValidity && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                          {validityCount} {validityCount === 1 ? 'regola' : 'regole'} di validità
                        </span>
                      )}
                      {hasExclusions && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-destructive/60 shrink-0" />
                          {exclusionCount} {exclusionCount === 1 ? 'esclusione' : 'esclusioni'}
                        </span>
                      )}
                    </div>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                )}

                {/* Expanded constraint panels */}
                {hasConstraints && isExpanded && (
                  <div className="grid grid-cols-2 divide-x divide-border/60 border-t border-border/60 bg-muted/20">
                    <div className="p-3">
                      <ConstraintSection
                        label="Validità"
                        constraints={ia.validity || []}
                        dotClass="bg-primary"
                        emptyLabel="Sempre valido"
                      />
                    </div>
                    <div className="p-3">
                      <ConstraintSection
                        label="Esclusioni"
                        constraints={ia.exclusions || []}
                        dotClass="bg-destructive/60"
                        emptyLabel="Nessuna esclusione"
                      />
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
            <BellOff className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Nessun allarme ignorato configurato</p>
          <p className="mt-1.5 text-sm text-muted-foreground">Aggiungi un allarme ignorato per iniziare.</p>
          {canWrite && (
            <Button
              size="sm"
              className="mt-5"
              onClick={() => {
                reset(EMPTY_DEFAULTS)
                setShowCreateDialog(true)
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Nuovo
            </Button>
          )}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(v) => { if (!isDirty || v) handleDialogClose(v) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" isDirty={isDirty} onDirtyClose={() => handleDialogClose(false)}>
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted shrink-0">
                <BellOff className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <DialogTitle className="text-base">
                  {editItem ? 'Modifica Allarme Ignorato' : 'Nuovo Allarme Ignorato'}
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  {editItem
                    ? 'Modifica le regole per questo allarme ignorato.'
                    : 'Configura un allarme da ignorare con le relative regole temporali.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-1">
            {/* Alarm + Environment */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Allarme</Label>
                <Controller
                  name="alarmId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isMutating}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona allarme" />
                      </SelectTrigger>
                      <SelectContent>
                        {alarms?.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.alarmId && (
                  <p className="text-xs text-destructive">{errors.alarmId.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Ambiente</Label>
                <Controller
                  name="environmentId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isMutating}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona ambiente" />
                      </SelectTrigger>
                      <SelectContent>
                        {environments?.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.environmentId && (
                  <p className="text-xs text-destructive">{errors.environmentId.message}</p>
                )}
              </div>
            </div>

            {/* Reason + Active */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  Motivo
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">(opzionale)</span>
                </Label>
                <Textarea
                  placeholder="Motivo per cui l'allarme viene ignorato"
                  rows={2}
                  {...register('reason')}
                  disabled={isMutating}
                />
              </div>
              <div className="space-y-2">
                <Label>Stato</Label>
                <Controller
                  name="isActive"
                  control={control}
                  render={({ field }) => (
                    <label
                      className={`flex items-center justify-between rounded-lg border border-input px-3 py-2.5 cursor-pointer transition-colors h-[74px] ${
                        field.value ? 'bg-muted/60 border-primary/30' : 'bg-background hover:bg-muted/30'
                      }`}
                    >
                      <span className="text-sm text-muted-foreground">
                        {field.value ? 'Regola attiva' : 'Regola disattivata'}
                      </span>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isMutating}
                      />
                    </label>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* Validity rules */}
            <TimeConstraintEditor
              label="Regole di validità"
              fieldArrayName="validity"
              control={control}
              register={register}
              disabled={isMutating}
            />

            <Separator />

            {/* Exclusion rules */}
            <TimeConstraintEditor
              label="Regole di esclusione"
              fieldArrayName="exclusions"
              control={control}
              register={register}
              disabled={isMutating}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogClose(false)}
                disabled={isMutating}
              >
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

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        open={!!deleteItem}
        onOpenChange={() => setDeleteItem(null)}
        description={`Sei sicuro di voler eliminare la regola per l'allarme "${deleteItem?.alarm.name}" nell'ambiente "${deleteItem?.environment.name}"? Questa azione non può essere annullata.`}
        onConfirm={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}
