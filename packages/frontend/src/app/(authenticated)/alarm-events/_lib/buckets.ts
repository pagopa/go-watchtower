import { Moon, Sun, Sunset, PhoneCall } from 'lucide-react'
import type { WorkingHours } from '@go-watchtower/shared'
import type { AlarmEvent } from '@/lib/api-client'
import { toMinutes, minuteOfDayInTz, isoWeekdayInTz } from './date-utils'

// ─── Bucket configs ───────────────────────────────────────────────────────────

type BucketId = 'pre' | 'work' | 'post'

export interface BucketCfg {
  Icon:        typeof Moon
  label:       string
  headerCls:   string
  textCls:     string
  borderCls:   string
  countCls:    string
}

export const BUCKETS: Record<BucketId, BucketCfg> = {
  pre: {
    Icon:      Moon,
    label:     'Fuori orario — Mattina',
    headerCls: 'bg-slate-50 dark:bg-slate-950/40',
    textCls:   'text-slate-600 dark:text-slate-400',
    borderCls: 'border-slate-200 dark:border-slate-800',
    countCls:  'bg-slate-200/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  work: {
    Icon:      Sun,
    label:     'Orario lavorativo',
    headerCls: 'bg-amber-50 dark:bg-amber-950/20',
    textCls:   'text-amber-700 dark:text-amber-400',
    borderCls: 'border-amber-200/80 dark:border-amber-900/30',
    countCls:  'bg-amber-200/60 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  },
  post: {
    Icon:      Sunset,
    label:     'Fuori orario — Sera',
    headerCls: 'bg-violet-50/70 dark:bg-violet-950/20',
    textCls:   'text-violet-600 dark:text-violet-400',
    borderCls: 'border-violet-200/60 dark:border-violet-900/20',
    countCls:  'bg-violet-200/50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  },
}

export const ONCALL_BUCKETS: Record<'oncall' | 'work', BucketCfg> = {
  oncall: {
    Icon:      PhoneCall,
    label:     'Reperibilità',
    headerCls: 'bg-rose-50/70 dark:bg-rose-950/20',
    textCls:   'text-rose-600 dark:text-rose-400',
    borderCls: 'border-rose-200/60 dark:border-rose-900/20',
    countCls:  'bg-rose-200/50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  },
  work: {
    Icon:      Sun,
    label:     'Orario lavorativo',
    headerCls: 'bg-amber-50 dark:bg-amber-950/20',
    textCls:   'text-amber-700 dark:text-amber-400',
    borderCls: 'border-amber-200/80 dark:border-amber-900/30',
    countCls:  'bg-amber-200/60 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  },
}

// ─── Event partitioning ───────────────────────────────────────────────────────

export function partitionEvents(events: AlarmEvent[], wh: WorkingHours) {
  const tz       = wh.timezone ?? 'Europe/Rome'
  const whStart  = toMinutes(wh.start)
  const whEnd    = toMinutes(wh.end)
  const workDays = new Set(wh.days)
  const pre: AlarmEvent[] = [], work: AlarmEvent[] = [], post: AlarmEvent[] = []
  for (const e of events) {
    const mod       = minuteOfDayInTz(e.firedAt, tz)
    const weekday   = isoWeekdayInTz(e.firedAt, tz)
    const isWorkDay = workDays.has(weekday)
    if (isWorkDay && mod >= whStart && mod < whEnd) work.push(e)
    else if (isWorkDay && mod < whStart)             pre.push(e)
    else                                             post.push(e)
  }
  return { pre, work, post }
}
