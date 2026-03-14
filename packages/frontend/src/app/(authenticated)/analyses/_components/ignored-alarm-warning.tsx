'use client'

import { useState } from 'react'
import {
  OctagonAlert, ExternalLink, Clock, Calendar, CalendarDays,
  Info, Ban, CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { IgnoredAlarm } from '@/lib/api-client'
import type { TimeConstraint } from '@go-watchtower/shared'

// ─── Time constraint renderer ─────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']

function fmtUtcDateTime(iso: string): string {
  return (
    new Date(iso).toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'UTC',
    }) + ' UTC'
  )
}

function ConstraintCard({ c }: { c: TimeConstraint }) {
  const rows: React.ReactNode[] = []

  if (c.periods && c.periods.length > 0) {
    c.periods.forEach((p) => (
      rows.push(
        <div key={`p-${p.start}-${p.end}`} className="flex items-start gap-2 text-sm">
          <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          <span className="tabular-nums text-foreground/80">
            {fmtUtcDateTime(p.start)}
            <span className="mx-1.5 text-muted-foreground/40">→</span>
            {fmtUtcDateTime(p.end)}
          </span>
        </div>
      )
    ))
  }

  if (c.weekdays && c.weekdays.length > 0) {
    rows.push(
      <div key="wd" className="flex items-center gap-2 text-sm">
        <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        <div className="flex flex-wrap gap-1">
          {c.weekdays.map((d) => (
            <span
              key={d}
              className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground/80"
            >
              {WEEKDAY_LABELS[d]}
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (c.hours && c.hours.length > 0) {
    rows.push(
      <div key="hr" className="flex items-start gap-2 text-sm">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        <div className="flex flex-wrap gap-1.5">
          {c.hours.map((h) => (
            <span
              key={`${h.start}-${h.end}`}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground/80"
            >
              {h.start}–{h.end}
            </span>
          ))}
          <span className="text-[10px] text-muted-foreground/50 self-center">UTC</span>
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground/70 italic">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        Sempre valido
      </div>
    )
  }

  return <div className="space-y-2">{rows}</div>
}

// ─── Section block ────────────────────────────────────────────────────────────

function ConstraintSection({
  label,
  icon: Icon,
  iconClass,
  accentClass,
  constraints,
  emptyLabel,
}: {
  label: string
  icon: React.ElementType
  iconClass: string
  accentClass: string
  constraints: TimeConstraint[]
  emptyLabel: string
}) {
  return (
    <div className="space-y-3">
      <div className={cn('flex items-center gap-2', iconClass)}>
        <Icon className="h-4 w-4 shrink-0" />
        <h3 className="text-sm font-semibold">{label}</h3>
        <Badge variant="secondary" className="ml-auto text-xs tabular-nums">
          {constraints.length === 0 ? 'nessuna' : `${constraints.length} regol${constraints.length === 1 ? 'a' : 'e'}`}
        </Badge>
      </div>

      {constraints.length === 0 ? (
        <p className={cn('rounded-lg border px-3 py-2 text-xs italic', accentClass)}>
          {emptyLabel}
        </p>
      ) : (
        <div className="space-y-2">
          {constraints.map((c, i) => (
            <div
              key={JSON.stringify(c)}
              className={cn(
                'rounded-lg border px-3.5 py-3 space-y-2',
                constraints.length > 1
                  ? 'relative pl-7'
                  : '',
                accentClass,
              )}
            >
              {constraints.length > 1 && (
                <span className="absolute left-3 top-3 text-[10px] font-bold tabular-nums text-muted-foreground/40">
                  {i + 1}
                </span>
              )}
              <ConstraintCard c={c} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Details dialog ───────────────────────────────────────────────────────────

interface IgnoredAlarmDetailsDialogProps {
  ignoredAlarm: IgnoredAlarm
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function IgnoredAlarmDetailsDialog({ ignoredAlarm, open, onOpenChange }: IgnoredAlarmDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0">

        {/* ── Header ── */}
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b">
          <div className="flex items-start gap-3 min-w-0 pr-6">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <OctagonAlert className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base leading-snug">
                Configurazione allarme ignorato
              </DialogTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Dettagli della regola di esclusione attiva per questo allarme.
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Identity card */}
          <div className="grid gap-4 rounded-xl border border-border bg-muted/20 px-5 py-4 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1">
                Allarme
              </p>
              <p className="text-sm font-semibold leading-snug break-all text-foreground">
                {ignoredAlarm.alarm.name}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1">
                Ambiente
              </p>
              <p className="text-sm font-medium">{ignoredAlarm.environment.name}</p>
            </div>
            {ignoredAlarm.reason && (
              <div className="sm:col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1">
                  Motivazione
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {ignoredAlarm.reason}
                </p>
              </div>
            )}
            <div className="sm:col-span-2 flex items-center gap-2 pt-1 border-t border-border/60">
              <span className="text-xs text-muted-foreground/60">Stato configurazione:</span>
              <Badge variant={ignoredAlarm.isActive ? 'success' : 'secondary'} className="text-xs">
                {ignoredAlarm.isActive ? 'Attiva' : 'Inattiva'}
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Validity */}
          <ConstraintSection
            label="Finestre di validità"
            icon={Clock}
            iconClass="text-amber-600 dark:text-amber-400"
            accentClass="border-amber-200/60 bg-amber-50/40 dark:border-amber-500/15 dark:bg-amber-950/20"
            constraints={ignoredAlarm.validity}
            emptyLabel="Nessuna restrizione temporale — questo allarme viene sempre ignorato"
          />

          {/* Exclusions */}
          {ignoredAlarm.exclusions.length > 0 && (
            <>
              <Separator />
              <ConstraintSection
                label="Finestre di esclusione"
                icon={Ban}
                iconClass="text-rose-600 dark:text-rose-400"
                accentClass="border-rose-200/60 bg-rose-50/40 dark:border-rose-500/15 dark:bg-rose-950/20"
                constraints={ignoredAlarm.exclusions}
                emptyLabel="Nessuna esclusione"
              />
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 border-t bg-muted/20 px-6 py-3 flex items-center gap-2">
          <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          <p className="text-xs text-muted-foreground/70">
            Puoi comunque procedere con l&apos;inserimento dell&apos;analisi se lo ritieni necessario.
          </p>
        </div>

      </DialogContent>
    </Dialog>
  )
}

// ─── Warning banner ───────────────────────────────────────────────────────────

interface IgnoredAlarmWarningBannerProps {
  ignoredAlarm: IgnoredAlarm
}

export function IgnoredAlarmWarningBanner({ ignoredAlarm }: IgnoredAlarmWarningBannerProps) {
  const [showDetails, setShowDetails] = useState(false)

  return (
    <>
      <div className={cn(
        'flex items-start gap-3 rounded-xl border px-4 py-3.5',
        'border-amber-400/30 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-950/25',
      )}>
        <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 leading-snug">
            Possibile allarme da ignorare
          </p>
          <p className="mt-0.5 text-xs text-amber-800/70 dark:text-amber-300/70 leading-relaxed">
            Questo allarme è configurato come &ldquo;da ignorare&rdquo; per{' '}
            <span className="font-semibold">{ignoredAlarm.environment.name}</span>.
            L&apos;analisi potrebbe non essere necessaria.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails(true)}
          className={cn(
            'shrink-0 h-7 gap-1.5 text-xs font-semibold',
            'text-amber-700 hover:text-amber-900 hover:bg-amber-100/80',
            'dark:text-amber-400 dark:hover:text-amber-200 dark:hover:bg-amber-900/40',
          )}
        >
          Vedi dettagli
          <ExternalLink className="h-3 w-3" />
        </Button>
      </div>

      <IgnoredAlarmDetailsDialog
        ignoredAlarm={ignoredAlarm}
        open={showDetails}
        onOpenChange={setShowDetails}
      />
    </>
  )
}
