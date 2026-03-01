'use client'

import { Package } from 'lucide-react'
import { Controller, type Control, type FieldErrors, type UseFormRegisterReturn } from 'react-hook-form'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { cn } from '@/lib/utils'
import type { Alarm, Environment, Product, UserDetail } from '@/lib/api-client'
import { romeLocalToISO, utcLocalToISO } from './analysis-form-schemas'
import { formatDateTimeUTC, formatDateTimeRome } from '../_lib/constants'

// --- TZ Companion ---
// Shown below a date picker after the user enters a value.

function TzCompanion({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 pl-0.5 pt-0.5">
      <span className="rounded bg-muted px-1 py-px text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">
        {label}
      </span>
      <span className="font-mono text-[11px] text-muted-foreground/70">{value}</span>
    </div>
  )
}

// --- AlarmField ---

interface AlarmFieldProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
  disabled: boolean
  alarms: Alarm[] | undefined
  showOnCall?: boolean
}

export function AlarmField({ control, errors, disabled, alarms, showOnCall = true }: AlarmFieldProps) {
  return (
    <div className="space-y-2 sm:col-span-2">
      <Label>Allarme *</Label>
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-1">
          <Controller
            name="alarmId"
            control={control}
            render={({ field }) => (
              <Combobox
                options={alarms?.map((a) => ({ value: a.id, label: a.name })) ?? []}
                value={field.value || ''}
                onValueChange={field.onChange}
                placeholder="Seleziona allarme"
                searchPlaceholder="Cerca allarme..."
                emptyMessage="Nessun allarme trovato."
                disabled={disabled}
              />
            )}
          />
          {errors.alarmId && (
            <p className="text-sm text-destructive">{errors.alarmId.message as string}</p>
          )}
        </div>
        {showOnCall && (
          <div className="shrink-0 pt-0.5">
            <Controller
              name="isOnCall"
              control={control}
              render={({ field }) => (
                <label
                  htmlFor="form-oncall"
                  className={cn(
                    'flex cursor-pointer select-none items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-all duration-200',
                    field.value
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400'
                      : 'border-border text-muted-foreground hover:bg-muted/40'
                  )}
                >
                  <Switch
                    id="form-oncall"
                    checked={field.value || false}
                    onCheckedChange={field.onChange}
                    disabled={disabled}
                    className="scale-[0.8]"
                  />
                  <span className="whitespace-nowrap">Reperibilità</span>
                </label>
              )}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// --- EnvironmentField ---

interface EnvironmentFieldProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
  disabled: boolean
  environments: Environment[] | undefined
}

export function EnvironmentField({ control, errors, disabled, environments }: EnvironmentFieldProps) {
  return (
    <div className="space-y-2">
      <Label>Ambiente *</Label>
      <Controller
        name="environmentId"
        control={control}
        render={({ field }) => (
          <Select
            value={field.value || ''}
            onValueChange={field.onChange}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleziona ambiente" />
            </SelectTrigger>
            <SelectContent>
              {environments?.map((env) => (
                <SelectItem key={env.id} value={env.id}>
                  {env.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {errors.environmentId && (
        <p className="text-sm text-destructive">{errors.environmentId.message as string}</p>
      )}
    </div>
  )
}

// --- OccurrencesField ---

interface OccurrencesFieldProps {
  registration: UseFormRegisterReturn
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
  disabled: boolean
}

export function OccurrencesField({ registration, errors, disabled }: OccurrencesFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="form-occurrences">Occorrenze</Label>
      <Input
        id="form-occurrences"
        type="number"
        min={1}
        placeholder="1"
        {...registration}
        disabled={disabled}
      />
      {errors.occurrences && (
        <p className="text-sm text-destructive">{errors.occurrences.message as string}</p>
      )}
    </div>
  )
}

// --- FirstAlarmField ---

interface FirstAlarmFieldProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
  disabled: boolean
  onAutoFill?: (value: string, fieldOnChange: (v: string) => void) => void
}

export function FirstAlarmField({ control, errors, disabled, onAutoFill }: FirstAlarmFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-1.5">
        <Label>Primo allarme *</Label>
        <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide">UTC</span>
      </div>
      <Controller
        name="firstAlarmAt"
        control={control}
        render={({ field }) => {
          let romeDisplay: string | null = null
          if (field.value) {
            try {
              romeDisplay = formatDateTimeRome(utcLocalToISO(field.value))
            } catch { /* ignore */ }
          }
          return (
            <div>
              <DateTimePicker
                value={field.value}
                onChange={(v) =>
                  onAutoFill ? onAutoFill(v, field.onChange) : field.onChange(v)
                }
                disabled={disabled}
              />
              {romeDisplay && <TzCompanion label="Roma" value={romeDisplay} />}
            </div>
          )
        }}
      />
      {errors.firstAlarmAt && (
        <p className="text-sm text-destructive">{errors.firstAlarmAt.message as string}</p>
      )}
    </div>
  )
}

// --- LastAlarmField ---

interface LastAlarmFieldProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
  disabled: boolean
  dateError?: string
}

export function LastAlarmField({ control, errors, disabled, dateError }: LastAlarmFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-1.5">
        <Label>Ultimo allarme *</Label>
        <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide">UTC</span>
      </div>
      <Controller
        name="lastAlarmAt"
        control={control}
        render={({ field }) => {
          let romeDisplay: string | null = null
          if (field.value) {
            try {
              romeDisplay = formatDateTimeRome(utcLocalToISO(field.value))
            } catch { /* ignore */ }
          }
          return (
            <div>
              <DateTimePicker
                value={field.value}
                onChange={field.onChange}
                disabled={disabled}
              />
              {romeDisplay && <TzCompanion label="Roma" value={romeDisplay} />}
            </div>
          )
        }}
      />
      {errors.lastAlarmAt && (
        <p className="text-sm text-destructive">{errors.lastAlarmAt.message as string}</p>
      )}
      {!errors.lastAlarmAt && dateError && (
        <p className="text-sm text-destructive">{dateError}</p>
      )}
    </div>
  )
}

// --- AnalysisDateField ---

interface AnalysisDateFieldProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
  disabled: boolean
  dateError?: string
}

export function AnalysisDateField({ control, errors, disabled, dateError }: AnalysisDateFieldProps) {
  return (
    <div className="space-y-2">
      <Controller
        name="analysisDate"
        control={control}
        render={({ field }) => {
          let utcDisplay: string | null = null
          if (field.value) {
            try {
              utcDisplay = formatDateTimeUTC(romeLocalToISO(field.value))
            } catch { /* ignore */ }
          }
          return (
            <>
              <div className="flex items-baseline gap-1.5">
                <Label>Data analisi *</Label>
                <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide">ora Roma</span>
              </div>
              <div>
                <DateTimePicker
                  value={field.value}
                  onChange={field.onChange}
                  disabled={disabled}
                  showNow
                  nowTimezone="Europe/Rome"
                />
                {utcDisplay && <TzCompanion label="UTC" value={utcDisplay} />}
              </div>
            </>
          )
        }}
      />
      {errors.analysisDate && (
        <p className="text-sm text-destructive">{errors.analysisDate.message as string}</p>
      )}
      {!errors.analysisDate && dateError && (
        <p className="text-sm text-destructive">{dateError}</p>
      )}
    </div>
  )
}

// --- OperatorField ---

interface OperatorFieldProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
  disabled: boolean
  users: UserDetail[]
  locked?: boolean
}

export function OperatorField({ control, errors, disabled, users, locked }: OperatorFieldProps) {
  return (
    <div className="space-y-2">
      <Label>Operatore *</Label>
      <Controller
        name="operatorId"
        control={control}
        render={({ field }) => (
          <Select
            value={field.value || ''}
            onValueChange={field.onChange}
            disabled={disabled || locked}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleziona operatore" />
            </SelectTrigger>
            <SelectContent>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {errors.operatorId && (
        <p className="text-sm text-destructive">{errors.operatorId.message as string}</p>
      )}
    </div>
  )
}

// --- AnalysisTypeSelect ---

interface AnalysisTypeSelectProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  disabled: boolean
  options: { value: string; label: string }[]
}

export function AnalysisTypeSelect({ control, disabled, options }: AnalysisTypeSelectProps) {
  return (
    <div className="space-y-2">
      <Label>Tipo *</Label>
      <Controller
        name="analysisType"
        control={control}
        render={({ field }) => (
          <Select
            value={field.value || ''}
            onValueChange={field.onChange}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleziona tipo" />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  )
}

// --- HandlerField (shortcut "non-gestito") ---

interface HandlerFieldProps {
  registration: UseFormRegisterReturn
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
  disabled: boolean
}

export function HandlerField({ registration, errors, disabled }: HandlerFieldProps) {
  return (
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor="form-handler">Gestito da (team/persona) *</Label>
      <Input
        id="form-handler"
        placeholder="Nome del team o persona che ha gestito l'allarme"
        {...registration}
        disabled={disabled}
      />
      {errors.handler && (
        <p className="text-sm text-destructive">{errors.handler.message as string}</p>
      )}
    </div>
  )
}

// --- IgnoreReasonField ---

interface IgnoreReasonFieldProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  disabled: boolean
  options: { value: string; label: string }[]
}

export function IgnoreReasonField({ control, disabled, options }: IgnoreReasonFieldProps) {
  return (
    <div className="space-y-2">
      <Label>Motivo *</Label>
      <Controller
        name="ignoreReasonCode"
        control={control}
        render={({ field }) => (
          <Select
            value={field.value || ''}
            onValueChange={field.onChange}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleziona motivo" />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  )
}

// --- ProductSelectorCard ---

interface ProductSelectorCardProps {
  products: Product[] | undefined
  selectedProductId: string
  onProductChange: (productId: string) => void
  disabled: boolean
}

export function ProductSelectorCard({
  products,
  selectedProductId,
  onProductChange,
  disabled,
}: ProductSelectorCardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-violet-500/20 shadow-sm dark:border-violet-500/15">
      <div className="flex items-center gap-2.5 border-b border-violet-200/60 bg-violet-50 px-5 py-3.5 dark:border-violet-500/15 dark:bg-violet-950/30">
        <Package className="h-3.5 w-3.5 shrink-0 text-violet-700 dark:text-violet-400" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-violet-700 dark:text-violet-400">
          Prodotto
        </h3>
      </div>
      <div className="space-y-2 p-5">
        <Label>Prodotto *</Label>
        <Select
          value={selectedProductId || ''}
          onValueChange={onProductChange}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleziona prodotto" />
          </SelectTrigger>
          <SelectContent>
            {products?.filter(p => p.isActive).map((product) => (
              <SelectItem key={product.id} value={product.id}>
                {product.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!selectedProductId && (
          <p className="text-sm text-muted-foreground">
            Seleziona un prodotto per caricare allarmi, ambienti e azioni finali.
          </p>
        )}
      </div>
    </div>
  )
}
