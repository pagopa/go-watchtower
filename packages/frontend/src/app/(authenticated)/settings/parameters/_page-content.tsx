'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, Check, X, Pencil,
  Shield, BarChart2, Cpu, Settings2, Clock, PhoneCall,
} from 'lucide-react'
import { toast } from 'sonner'
import { isWorkingHoursSetting, isOnCallHoursSetting, isFkSetting } from '@go-watchtower/shared'
import type { OnCallHours } from '@go-watchtower/shared'
import { api, type SystemSetting } from '@/lib/api-client'
import { usePermissions } from '@/hooks/use-permissions'
import { useFkSettingLabel } from '@/hooks/use-fk-setting-label'
import { FK_RESOLVERS } from '@/lib/fk-setting-resolvers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = [
  { n: 1, label: 'Lun', weekend: false },
  { n: 2, label: 'Mar', weekend: false },
  { n: 3, label: 'Mer', weekend: false },
  { n: 4, label: 'Gio', weekend: false },
  { n: 5, label: 'Ven', weekend: false },
  { n: 6, label: 'Sab', weekend: true  },
  { n: 7, label: 'Dom', weekend: true  },
]

const DAY_FULL_NAMES: Record<number, string> = {
  1: 'Lunedì', 2: 'Martedì', 3: 'Mercoledì',
  4: 'Giovedì', 5: 'Venerdì', 6: 'Sabato', 7: 'Domenica',
}

const CATEGORY_META: Record<string, {
  label: string
  Icon: React.ComponentType<{ className?: string }>
  accent: string
  headerCls: string
}> = {
  AUTH:     { label: 'Autenticazione', Icon: Shield,   accent: 'bg-blue-500',   headerCls: 'text-blue-600 dark:text-blue-400'   },
  ANALYSIS: { label: 'Analisi',        Icon: BarChart2, accent: 'bg-amber-500',  headerCls: 'text-amber-600 dark:text-amber-400' },
  SYSTEM:   { label: 'Sistema',        Icon: Cpu,       accent: 'bg-violet-500', headerCls: 'text-violet-600 dark:text-violet-400' },
}

const DEFAULT_CATEGORY = { label: 'Generale', Icon: Settings2, accent: 'bg-slate-400', headerCls: 'text-slate-500' }

const TYPE_DOT: Record<string, string> = {
  STRING:  'bg-blue-400',
  NUMBER:  'bg-amber-400',
  BOOLEAN: 'bg-emerald-400',
  JSON:    'bg-violet-400',
}

// ─── Working Hours Dialog ─────────────────────────────────────────────────────

function WorkingHoursDialog({
  setting,
  open,
  onOpenChange,
  onSave,
  isPending,
}: {
  setting: SystemSetting
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (value: unknown) => void
  isPending: boolean
}) {
  const initial = isWorkingHoursSetting(setting) ? setting.value : null
  const [timezone, setTimezone] = useState(initial?.timezone ?? 'Europe/Rome')
  const [start, setStart] = useState(initial?.start ?? '09:00')
  const [end,   setEnd]   = useState(initial?.end   ?? '18:00')
  const [days,  setDays]  = useState<number[]>(initial?.days ?? [1, 2, 3, 4, 5])

  const toggleDay = (n: number) =>
    setDays((prev) =>
      prev.includes(n) ? prev.filter((d) => d !== n) : [...prev, n].sort((a, b) => a - b)
    )

  const selectedLabels = DAYS.filter(({ n }) => days.includes(n)).map(({ label }) => label)
  const previewText = selectedLabels.length > 0
    ? `${selectedLabels.join(', ')} · ${start}–${end}`
    : `Nessun giorno selezionato`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-950/50">
              <Clock className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <DialogTitle className="text-base">Orari lavorativi</DialogTitle>
          </div>
          <DialogDescription className="text-xs leading-relaxed">
            Configura la finestra oraria e i giorni lavorativi usati per il calcolo delle KPI e il
            filtraggio temporale degli allarmi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Timezone */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              Fuso orario
            </p>
            <Input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Europe/Rome"
              className="font-mono text-sm"
              disabled={isPending}
            />
          </div>

          {/* Time range */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              Fascia oraria
            </p>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label htmlFor="wh-start" className="text-xs text-muted-foreground">Dalle</label>
                <Input
                  id="wh-start"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="font-mono text-sm"
                  disabled={isPending}
                />
              </div>
              <div className="pb-2.5 text-sm text-muted-foreground/60 select-none">—</div>
              <div className="flex-1 space-y-1">
                <label htmlFor="wh-end" className="text-xs text-muted-foreground">Alle</label>
                <Input
                  id="wh-end"
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="font-mono text-sm"
                  disabled={isPending}
                />
              </div>
            </div>
          </div>

          {/* Days */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              Giorni lavorativi
            </p>
            <div className="flex gap-1.5">
              {DAYS.map(({ n, label, weekend }) => {
                const active = days.includes(n)
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => toggleDay(n)}
                    disabled={isPending}
                    className={[
                      'flex-1 rounded-lg py-3 text-xs font-semibold transition-all duration-150',
                      active
                        ? weekend
                          ? 'bg-orange-500 text-white shadow-sm'
                          : 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted text-muted-foreground hover:bg-muted/60',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-lg border bg-muted/30 px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1">
              Anteprima
            </p>
            <p className="font-mono text-sm font-medium">{previewText}</p>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <DialogClose asChild>
            <Button variant="outline" size="sm" disabled={isPending}>
              Annulla
            </Button>
          </DialogClose>
          <Button
            size="sm"
            onClick={() => onSave({ timezone, start, end, days })}
            disabled={isPending || days.length === 0}
          >
            {isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── On-Call Hours Dialog ─────────────────────────────────────────────────────

function OnCallHoursDialog({
  setting,
  open,
  onOpenChange,
  onSave,
  isPending,
}: {
  setting: SystemSetting
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (value: unknown) => void
  isPending: boolean
}) {
  const initial = isOnCallHoursSetting(setting) ? setting.value : null

  const [timezone,         setTimezone]         = useState(initial?.timezone         ?? 'Europe/Rome')
  const [overnightEnabled, setOvernightEnabled] = useState(initial?.overnight != null)
  const [oStart,           setOStart]           = useState(initial?.overnight?.start ?? '18:00')
  const [oEnd,             setOEnd]             = useState(initial?.overnight?.end   ?? '09:00')
  const [oDays,            setODays]            = useState<number[]>(initial?.overnight?.days ?? [1, 2, 3, 4, 5])
  const [allDayEnabled,    setAllDayEnabled]    = useState(initial?.allDay != null)
  const [adStartDay,       setAdStartDay]       = useState(initial?.allDay?.startDay ?? 6)
  const [adEndDay,         setAdEndDay]         = useState(initial?.allDay?.endDay   ?? 1)
  const [adEndTime,        setAdEndTime]        = useState(initial?.allDay?.endTime  ?? '09:00')

  const toggleODay = (n: number) =>
    setODays((prev) =>
      prev.includes(n) ? prev.filter((d) => d !== n) : [...prev, n].sort((a, b) => a - b)
    )

  const handleSave = () => {
    const value: OnCallHours = {
      timezone,
      ...(overnightEnabled ? { overnight: { start: oStart, end: oEnd, days: oDays } } : {}),
      ...(allDayEnabled    ? { allDay: { startDay: adStartDay, endDay: adEndDay, endTime: adEndTime } } : {}),
    }
    onSave(value)
  }

  const isValid = timezone.trim() !== '' &&
    (!overnightEnabled || oDays.length > 0) &&
    (overnightEnabled || allDayEnabled)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-950/50">
              <PhoneCall className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </div>
            <DialogTitle className="text-base">Orari di reperibilità</DialogTitle>
          </div>
          <DialogDescription className="text-xs leading-relaxed">
            Configura le fasce di reperibilità per la classificazione degli allarmi fuori orario.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Timezone */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              Fuso orario
            </p>
            <Input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Europe/Rome"
              className="font-mono text-sm"
              disabled={isPending}
            />
          </div>

          {/* Overnight section */}
          <div className="space-y-3 rounded-lg border px-3.5 py-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">Turno notturno feriale</p>
              <Switch
                checked={overnightEnabled}
                onCheckedChange={setOvernightEnabled}
                disabled={isPending}
              />
            </div>
            {overnightEnabled && (
              <div className="space-y-3 pt-1">
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <label htmlFor="oc-o-start" className="text-xs text-muted-foreground">Dalle</label>
                    <Input id="oc-o-start" type="time" value={oStart} onChange={(e) => setOStart(e.target.value)}
                      className="font-mono text-sm" disabled={isPending} />
                  </div>
                  <div className="pb-2.5 text-sm text-muted-foreground/60 select-none">→</div>
                  <div className="flex-1 space-y-1">
                    <label htmlFor="oc-o-end" className="text-xs text-muted-foreground">Alle (giorno dopo)</label>
                    <Input id="oc-o-end" type="time" value={oEnd} onChange={(e) => setOEnd(e.target.value)}
                      className="font-mono text-sm" disabled={isPending} />
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {DAYS.map(({ n, label, weekend }) => {
                    const active = oDays.includes(n)
                    return (
                      <button key={n} type="button" onClick={() => toggleODay(n)} disabled={isPending}
                        className={[
                          'flex-1 rounded-lg py-2.5 text-xs font-semibold transition-all',
                          active
                            ? weekend ? 'bg-orange-500 text-white' : 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/60',
                        ].join(' ')}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* AllDay section */}
          <div className="space-y-3 rounded-lg border px-3.5 py-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">Turno weekend / multi-giorno</p>
              <Switch
                checked={allDayEnabled}
                onCheckedChange={setAllDayEnabled}
                disabled={isPending}
              />
            </div>
            {allDayEnabled && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label htmlFor="oc-ad-start" className="text-xs text-muted-foreground">Da</label>
                    <Select value={String(adStartDay)} onValueChange={(v) => setAdStartDay(Number(v))}>
                      <SelectTrigger id="oc-ad-start" className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(DAY_FULL_NAMES).map(([n, name]) => (
                          <SelectItem key={n} value={n}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="oc-ad-end" className="text-xs text-muted-foreground">A (fino alle)</label>
                    <Select value={String(adEndDay)} onValueChange={(v) => setAdEndDay(Number(v))}>
                      <SelectTrigger id="oc-ad-end" className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(DAY_FULL_NAMES).map(([n, name]) => (
                          <SelectItem key={n} value={n}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label htmlFor="oc-ad-endtime" className="text-xs text-muted-foreground">Ora di fine</label>
                  <Input id="oc-ad-endtime" type="time" value={adEndTime} onChange={(e) => setAdEndTime(e.target.value)}
                    className="h-8 w-28 font-mono text-sm" disabled={isPending} />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-2">
          <DialogClose asChild>
            <Button variant="outline" size="sm" disabled={isPending}>Annulla</Button>
          </DialogClose>
          <Button size="sm" onClick={handleSave} disabled={isPending || !isValid}>
            {isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── FK select editor ─────────────────────────────────────────────────────────

function FkSelectEditor({
  setting,
  onSave,
  onCancel,
  isPending,
}: {
  setting: SystemSetting
  onSave: (v: unknown) => void
  onCancel: () => void
  isPending: boolean
}) {
  const resolver = setting.format ? FK_RESOLVERS[setting.format] : null
  const { data: options = [], isLoading } = useQuery({
    queryKey: resolver?.queryKey ?? ['__fk_noop__'],
    queryFn:  resolver?.fetch    ?? (() => Promise.resolve([])),
    enabled:  resolver !== null,
    staleTime: 5 * 60 * 1000,
  })

  const currentValue = typeof setting.value === 'string' ? setting.value : ''

  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={currentValue}
        onValueChange={(v) => onSave(v)}
        disabled={isPending || isLoading}
      >
        <SelectTrigger className="h-7 w-44 text-sm">
          <SelectValue placeholder={isLoading ? 'Caricamento…' : 'Seleziona…'} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={onCancel}
        disabled={isPending}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}

// ─── Value display ─────────────────────────────────────────────────────────────

function ValueDisplay({ setting }: { setting: SystemSetting }) {
  const fkLabel = useFkSettingLabel(setting.format, setting.value)

  if (isFkSetting(setting)) {
    return (
      <span className="rounded bg-muted px-2 py-0.5 text-sm font-medium text-foreground">
        {fkLabel ?? <span className="animate-pulse text-muted-foreground/40">···</span>}
      </span>
    )
  }
  if (isWorkingHoursSetting(setting)) {
    const wh = setting.value
    const timeRange = wh?.start && wh?.end ? `${wh.start}–${wh.end}` : '—'
    const dayLabels = (wh?.days ?? [])
      .map((d) => DAYS.find(({ n }) => n === d)?.label)
      .filter(Boolean)
      .join(' · ')
    return (
      <span className="font-mono text-sm tabular-nums text-foreground">
        {dayLabels
          ? <><span className="text-muted-foreground">{dayLabels}</span> <span className="text-muted-foreground/40 mx-0.5">·</span> {timeRange}</>
          : timeRange
        }
        {wh?.timezone && (
          <span className="ml-1 text-muted-foreground/50">· {wh.timezone}</span>
        )}
      </span>
    )
  }
  if (isOnCallHoursSetting(setting)) {
    const oc = setting.value
    const parts: string[] = []
    if (oc.overnight) {
      const dls = oc.overnight.days.map((d) => DAYS.find(({ n }) => n === d)?.label).filter(Boolean).join(' ')
      parts.push(`${oc.overnight.start}→${oc.overnight.end}${dls ? ` (${dls})` : ''}`)
    }
    if (oc.allDay) {
      const s = DAYS.find(({ n }) => n === oc.allDay!.startDay)?.label ?? oc.allDay.startDay
      const e = DAYS.find(({ n }) => n === oc.allDay!.endDay)?.label   ?? oc.allDay.endDay
      parts.push(`${s}–${e} ${oc.allDay.endTime}`)
    }
    return (
      <span className="font-mono text-xs tabular-nums text-foreground">
        {parts.length > 0 ? parts.join(' · ') : '—'}
        <span className="ml-1 text-muted-foreground/50">· {oc.timezone}</span>
      </span>
    )
  }
  if (setting.type === 'BOOLEAN') {
    return null // rendered as live switch in the row
  }
  if (setting.type === 'NUMBER') {
    return (
      <span className="font-mono text-sm font-semibold tabular-nums">
        {String(setting.value ?? '—')}
      </span>
    )
  }
  const val = String(setting.value ?? '')
  const display = val.length > 36 ? val.slice(0, 34) + '…' : val
  return (
    <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
      {display || '—'}
    </span>
  )
}

// ─── Inline editor (STRING / NUMBER) ──────────────────────────────────────────

function InlineEditor({
  setting,
  onSave,
  onCancel,
  isPending,
}: {
  setting: SystemSetting
  onSave: (v: unknown) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [draft, setDraft] = useState<unknown>(setting.value)

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type={setting.type === 'NUMBER' ? 'number' : 'text'}
        value={String(draft ?? '')}
        onChange={(e) =>
          setDraft(setting.type === 'NUMBER' ? Number(e.target.value) : e.target.value)
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave(draft)
          if (e.key === 'Escape') onCancel()
        }}
        className="h-7 w-44 font-mono text-sm"
        disabled={isPending}
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 shrink-0 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/30"
        onClick={() => onSave(draft)}
        disabled={isPending}
      >
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={onCancel}
        disabled={isPending}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}

// ─── Setting card row ─────────────────────────────────────────────────────────

function SettingCard({
  setting,
  canWrite,
  accent,
}: {
  setting: SystemSetting
  canWrite: boolean
  accent: string
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const mutation = useMutation({
    mutationFn: (value: unknown) => api.updateSetting(setting.key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['working-hours'] })
      queryClient.invalidateQueries({ queryKey: ['on-call-hours'] })
      setEditing(false)
      setDialogOpen(false)
      toast.success('Configurazione aggiornata')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Errore durante il salvataggio')
    },
  })

  const isWorkingHours = isWorkingHoursSetting(setting)
  const isOnCallHours  = isOnCallHoursSetting(setting)
  const needsDialog    = isWorkingHours || isOnCallHours
  const isFk           = isFkSetting(setting)
  const isBoolean      = setting.type === 'BOOLEAN'
  const isInline       = !needsDialog && !isFk && !isBoolean

  return (
    <>
      <div className="group relative flex items-start gap-0 overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-sm">
        {/* Left accent strip */}
        <div className={`w-[3px] shrink-0 self-stretch rounded-l-xl ${accent} opacity-40 group-hover:opacity-70 transition-opacity`} />

        {/* Content */}
        <div className="flex flex-1 items-start justify-between gap-4 px-5 py-4 min-w-0">
          {/* Left: label + description + key */}
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TYPE_DOT[setting.type] ?? 'bg-slate-400'}`} />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-sm font-semibold leading-snug text-foreground">
                {setting.label}
              </p>
              {setting.description && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {setting.description}
                </p>
              )}
              <p className="pt-1 font-mono text-[10px] text-muted-foreground/30 select-all">
                {setting.key}
              </p>
            </div>
          </div>

          {/* Right: value + edit */}
          <div className="flex shrink-0 items-center gap-2">
            {isBoolean ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {setting.value ? 'Attivo' : 'Inattivo'}
                </span>
                <Switch
                  checked={!!setting.value}
                  onCheckedChange={(v) => canWrite && mutation.mutate(v)}
                  disabled={!canWrite || mutation.isPending}
                />
                {mutation.isPending && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </div>
            ) : editing && isFk ? (
              <FkSelectEditor
                setting={setting}
                onSave={(v) => mutation.mutate(v)}
                onCancel={() => setEditing(false)}
                isPending={mutation.isPending}
              />
            ) : editing && isInline ? (
              <InlineEditor
                setting={setting}
                onSave={(v) => mutation.mutate(v)}
                onCancel={() => setEditing(false)}
                isPending={mutation.isPending}
              />
            ) : (
              <div className="flex items-center gap-2">
                <ValueDisplay setting={setting} />
                {canWrite && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                    onClick={() => needsDialog ? setDialogOpen(true) : setEditing(true)}
                    title="Modifica"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {isWorkingHours && (
        <WorkingHoursDialog
          setting={setting}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSave={(v) => mutation.mutate(v)}
          isPending={mutation.isPending}
        />
      )}
      {isOnCallHours && (
        <OnCallHoursDialog
          setting={setting}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSave={(v) => mutation.mutate(v)}
          isPending={mutation.isPending}
        />
      )}
    </>
  )
}

// ─── Category section ─────────────────────────────────────────────────────────

function CategorySection({
  category,
  settings,
  canWrite,
}: {
  category: string
  settings: SystemSetting[]
  canWrite: boolean
}) {
  const meta = CATEGORY_META[category] ?? DEFAULT_CATEGORY
  const { Icon } = meta

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5 px-0.5">
        <div className={`flex h-6 w-6 items-center justify-center rounded-md bg-muted ${meta.headerCls}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <h2 className={`text-xs font-bold uppercase tracking-widest ${meta.headerCls}`}>
          {meta.label}
        </h2>
        <div className="flex-1 border-t border-border/40" />
        <span className="text-[10px] font-mono text-muted-foreground/40 tabular-nums">
          {settings.length} {settings.length === 1 ? 'voce' : 'voci'}
        </span>
      </div>

      <div className="space-y-2">
        {settings.map((s) => (
          <SettingCard
            key={s.key}
            setting={s}
            canWrite={canWrite}
            accent={meta.accent}
          />
        ))}
      </div>
    </section>
  )
}

// ─── Skeleton loading ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      {[3, 1, 2].map((count, gi) => (
        <div key={gi} className="space-y-3">
          <div className="flex items-center gap-2.5 px-0.5">
            <Skeleton className="h-6 w-6 rounded-md" />
            <Skeleton className="h-3 w-24" />
            <div className="flex-1 border-t border-border/40" />
          </div>
          <div className="space-y-2">
            {[...Array(count)].map((_, i) => (
              <div key={`${gi}-${i}`} className="flex items-start gap-0 overflow-hidden rounded-xl border bg-card">
                <div className="w-[3px] self-stretch bg-muted" />
                <div className="flex flex-1 items-start justify-between gap-4 px-5 py-4">
                  <div className="flex items-start gap-3 flex-1">
                    <Skeleton className="mt-1.5 h-2 w-2 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-72" />
                      <Skeleton className="h-2.5 w-36 mt-2" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-24 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function SystemParametersPage() {
  const { can, isLoading: permissionsLoading } = usePermissions()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn:  api.getSettings,
  })

  const canWrite = !permissionsLoading && can('SYSTEM_SETTING', 'write')

  const grouped = settings?.reduce<Record<string, SystemSetting[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category]!.push(s)
    return acc
  }, {}) ?? {}

  // Sort categories: AUTH first, then ANALYSIS, SYSTEM, rest alphabetically
  const CATEGORY_ORDER = ['AUTH', 'ANALYSIS', 'SYSTEM']
  const categories = Object.keys(grouped).sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a)
    const ib = CATEGORY_ORDER.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.localeCompare(b)
  })

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-8">
      {/* Header */}
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Configurazioni</h1>
        <p className="text-sm text-muted-foreground">
          Parametri di sistema e impostazioni dell&apos;applicazione.
          {!canWrite && !permissionsLoading && (
            <span className="ml-2 text-xs text-muted-foreground/60">(sola lettura)</span>
          )}
        </p>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <Settings2 className="mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">Nessuna configurazione disponibile</p>
        </div>
      ) : (
        <div className="space-y-10">
          {categories.map((category) => (
            <CategorySection
              key={category}
              category={category}
              settings={grouped[category]!}
              canWrite={canWrite}
            />
          ))}
        </div>
      )}
    </div>
  )
}
