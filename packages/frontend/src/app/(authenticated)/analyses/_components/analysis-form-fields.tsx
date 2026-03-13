'use client'

import { Info, Package, Plus, Trash2 } from 'lucide-react'
import { Controller, type Control, type FieldError, type FieldErrors, type FieldValues, type UseFormRegister, type UseFormRegisterReturn } from 'react-hook-form'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { inferLinkType } from '@go-watchtower/shared'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Alarm, Environment, Product, UserDetail } from '@/lib/api-client'
import { romeLocalToISO, utcLocalToISO } from './analysis-form-schemas'
import { formatDateTimeUTC, formatDateTimeRome } from '../_lib/constants'

/** Type-safe access to nested field array errors (e.g. errors.trackingIds[0].traceId). */
function getFieldError(errors: FieldErrors, arrayName: string, index: number, field: string): FieldError | undefined {
  const arr = errors[arrayName]
  if (!Array.isArray(arr)) return undefined
  const entry = arr[index] as Record<string, FieldError> | undefined
  return entry?.[field]
}

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

// --- FieldHint ---
// A small info icon with a tooltip, placed next to field labels.

function FieldHint({ text }: { text: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            tabIndex={-1}
            className="ml-0.5 inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground/40 transition-colors hover:text-muted-foreground/70 focus:outline-none"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-72 text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// --- AlarmField ---

interface AlarmFieldProps {
  control: Control<FieldValues>
  errors: FieldErrors<FieldValues>
  disabled: boolean
  alarms: Alarm[] | undefined
  showOnCall?: boolean
  onAlarmChange?: (alarm: Alarm) => void
}

export function AlarmField({ control, errors, disabled, alarms, showOnCall = true, onAlarmChange }: AlarmFieldProps) {
  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex items-center">
        <Label>Allarme *</Label>
        <FieldHint text="Selezionando un allarme che ha un runbook associato, il campo Runbook viene compilato automaticamente." />
      </div>
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-1">
          <Controller
            name="alarmId"
            control={control}
            render={({ field }) => (
              <Combobox
                options={alarms?.map((a) => ({ value: a.id, label: a.name })) ?? []}
                value={field.value || ''}
                onValueChange={(value) => {
                  field.onChange(value)
                  const selectedAlarm = alarms?.find((a) => a.id === value)
                  if (selectedAlarm) {
                    onAlarmChange?.(selectedAlarm)
                  }
                }}
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
  control: Control<FieldValues>
  errors: FieldErrors<FieldValues>
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
  errors: FieldErrors<FieldValues>
  disabled: boolean
}

export function OccurrencesField({ registration, errors, disabled }: OccurrencesFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center">
        <Label htmlFor="form-occurrences">Occorrenze</Label>
        <FieldHint text="Numero di volte che l'allarme si e' attivato in questo evento. Usato nei report KPI per calcolare il totale giornaliero." />
      </div>
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
  control: Control<FieldValues>
  errors: FieldErrors<FieldValues>
  disabled: boolean
  onAutoFill?: (value: string, fieldOnChange: (v: string) => void) => void
  showNow?: boolean
}

export function FirstAlarmField({ control, errors, disabled, onAutoFill, showNow }: FirstAlarmFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label>Primo allarme *</Label>
        <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide">UTC</span>
        <FieldHint text={<>Inserisci la data/ora in UTC. Puoi incollare date in vari formati: <span className="font-mono">28/02/2026 08:00</span>, <span className="font-mono">28/02/2026 08.00.55</span>, oppure ISO come <span className="font-mono">2026-02-28T08:00:55Z</span>. Se &quot;Ultimo allarme&quot; e' vuoto, viene compilato automaticamente con lo stesso valore.</>} />
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
                showNow={showNow}
                nowTimezone={showNow ? 'UTC' : undefined}
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
  control: Control<FieldValues>
  errors: FieldErrors<FieldValues>
  disabled: boolean
  dateError?: string
}

export function LastAlarmField({ control, errors, disabled, dateError }: LastAlarmFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label>Ultimo allarme *</Label>
        <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide">UTC</span>
        <FieldHint text={<>Inserisci la data/ora in UTC. Puoi incollare date in vari formati: <span className="font-mono">28/02/2026 08:00</span>, <span className="font-mono">28/02/2026 08.00.55</span>, oppure ISO. Deve essere uguale o successivo al primo allarme.</>} />
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
  control: Control<FieldValues>
  errors: FieldErrors<FieldValues>
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
              <div className="flex items-center gap-1.5">
                <Label>Data analisi *</Label>
                <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide">ora Roma</span>
                <FieldHint text={<>Inserisci la data/ora nel fuso orario di Roma (Europe/Rome). Puoi incollare date in vari formati: <span className="font-mono">28/02/2026 08:00</span>, <span className="font-mono">28/02/2026 08.00.55</span>, oppure ISO. Usa il pulsante orologio per impostare data e ora corrente.</>} />
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
  control: Control<FieldValues>
  errors: FieldErrors<FieldValues>
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
  control: Control<FieldValues>
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
  errors: FieldErrors<FieldValues>
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
  control: Control<FieldValues>
  disabled: boolean
  options: { value: string; label: string }[]
  errors?: FieldErrors<FieldValues>
}

export function IgnoreReasonField({ control, disabled, options, errors }: IgnoreReasonFieldProps) {
  const error = errors?.ignoreReasonCode?.message as string | undefined
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
            <SelectTrigger className={error ? 'border-destructive' : ''}>
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
      {error && <p className="text-xs text-destructive">{error}</p>}
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

// --- TrackingIdsField ---

interface TrackingIdsFieldProps {
  fields: { id: string }[]
  append: (value: FieldValues) => void
  remove: (index: number) => void
  register: UseFormRegister<FieldValues>
  errors: FieldErrors<FieldValues>
  disabled: boolean
}

export function TrackingIdsField({ fields, append, remove, register, errors, disabled }: TrackingIdsFieldProps) {
  return (
    <div className="space-y-3 sm:col-span-2">
      <Label>ID di Tracciamento</Label>
      {fields.map((field, index) => (
        <div key={field.id} className="overflow-hidden rounded-lg border border-blue-200/60 dark:border-blue-500/20">
          <div className="flex items-center gap-2 border-b border-blue-200/50 bg-blue-50/80 px-3 py-2 dark:border-blue-500/15 dark:bg-blue-950/20">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500/15 text-[10px] font-bold text-blue-600 dark:text-blue-400">
              {index + 1}
            </span>
            <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
              ID Tracciamento
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto h-6 w-6 text-muted-foreground/60 hover:text-destructive"
              onClick={() => remove(index)}
              disabled={disabled}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <div className="space-y-2 p-3">
            <div className="flex-1">
              <Input
                placeholder="Trace ID"
                className="font-mono text-sm"
                {...register(`trackingIds.${index}.traceId`)}
                disabled={disabled}
              />
              {getFieldError(errors, 'trackingIds', index, 'traceId') && (
                <p className="mt-1 text-xs text-destructive">
                  {getFieldError(errors, 'trackingIds', index, 'traceId')?.message}
                </p>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Codice errore (es. 500)"
                {...register(`trackingIds.${index}.errorCode`)}
                disabled={disabled}
              />
              <Input
                type="datetime-local"
                step="1"
                {...register(`trackingIds.${index}.timestamp`)}
                disabled={disabled}
              />
            </div>
            <Textarea
              placeholder="Dettaglio errore..."
              rows={2}
              {...register(`trackingIds.${index}.errorDetail`)}
              disabled={disabled}
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ traceId: '', errorCode: '', errorDetail: '', timestamp: '' })}
        disabled={disabled}
      >
        <Plus className="mr-1 h-4 w-4" />
        Aggiungi ID
      </Button>
    </div>
  )
}

// --- LinksField ---

interface LinksFieldProps {
  fields: { id: string }[]
  append: (value: FieldValues) => void
  remove: (index: number) => void
  register: UseFormRegister<FieldValues>
  errors: FieldErrors<FieldValues>
  linkUrlValues: string[]
  disabled: boolean
}

export function LinksField({ fields, append, remove, register, errors, linkUrlValues, disabled }: LinksFieldProps) {
  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="flex items-center">
        <Label>Link</Label>
        <FieldHint text="Il tipo di link (CloudWatch, Jira, Confluence, ecc.) viene rilevato automaticamente dall'URL inserito." />
      </div>
      {fields.map((field, index) => {
        const urlValue = linkUrlValues[index] ?? ''
        const linkType = urlValue ? inferLinkType(urlValue) : ''
        return (
          <div key={field.id} className="overflow-hidden rounded-lg border border-border">
            <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">
                Link #{index + 1}
              </span>
              {linkType && (
                <span className="rounded bg-secondary px-1.5 py-px text-[10px] font-medium text-secondary-foreground">
                  {linkType}
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto h-6 w-6 text-muted-foreground/60 hover:text-destructive"
                onClick={() => remove(index)}
                disabled={disabled}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-2 p-3">
              <Input
                placeholder="https://..."
                {...register(`links.${index}.url`)}
                disabled={disabled}
              />
              {getFieldError(errors, 'links', index, 'url') && (
                <p className="text-xs text-destructive">
                  {getFieldError(errors, 'links', index, 'url')?.message}
                </p>
              )}
              <Input
                placeholder="Nome (opzionale)"
                {...register(`links.${index}.name`)}
                disabled={disabled}
              />
            </div>
          </div>
        )
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ url: '', name: '', type: '' })}
        disabled={disabled}
      >
        <Plus className="mr-1 h-4 w-4" />
        Aggiungi Link
      </Button>
    </div>
  )
}
