import { memo } from 'react'
import Link from 'next/link'
import { PhoneCall, BookOpen, FileSearch } from 'lucide-react'
import type { AlarmEvent } from '@/lib/api-client'

type EmbeddedAlarm = NonNullable<AlarmEvent['alarm']>

const UTC_DATE_FORMATTER = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'UTC',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit',
})

function formatDateTimeUTC(iso: string): string {
  try {
    return UTC_DATE_FORMATTER.format(new Date(iso)) + ' UTC'
  } catch {
    return iso
  }
}

export interface AlarmEventCellProps {
  columnId: string
  event: AlarmEvent
  isOnCall?: boolean
  onAlarmClick?: (alarm: EmbeddedAlarm, productId: string) => void
}

export const AlarmEventCell = memo(function AlarmEventCell({
  columnId,
  event,
  isOnCall,
  onAlarmClick,
}: AlarmEventCellProps) {
  switch (columnId) {
    case 'firedAt':
      return (
        <span className="font-mono text-xs tabular-nums">
          {formatDateTimeUTC(event.firedAt)}
        </span>
      )
    case 'name':
      return <span className="truncate font-medium text-sm">{event.name}</span>
    case 'tipo':
      return isOnCall
        ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            <PhoneCall className="h-2.5 w-2.5" />
            on-call
          </span>
        )
        : (
          <span className="inline-flex items-center rounded border border-border/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/50">
            normale
          </span>
        )
    case 'link':
      if (!event.alarm) return <span className="text-muted-foreground/25 text-sm">—</span>
      return onAlarmClick
        ? (
          <button
            type="button"
            title={event.alarm.name}
            className="inline-flex items-center justify-center rounded-md border border-primary/20 bg-primary/5 p-1 text-primary hover:bg-primary/10 hover:border-primary/40 transition-colors"
            onClick={(e) => { e.stopPropagation(); onAlarmClick(event.alarm!, event.product.id) }}
          >
            <BookOpen className="h-3.5 w-3.5" />
          </button>
        )
        : (
          <Link
            href={`/products/${event.product.id}?tab=alarms`}
            title={event.alarm.name}
            className="inline-flex items-center justify-center rounded-md border border-primary/20 bg-primary/5 p-1 text-primary hover:bg-primary/10 hover:border-primary/40 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <BookOpen className="h-3.5 w-3.5" />
          </Link>
        )
    case 'analysis':
      if (!event.analysisId) return <span className="text-muted-foreground/25 text-sm">—</span>
      return (
        <Link
          href={`/analyses?productId=${event.product.id}&analysisId=${event.analysisId}`}
          title="Vai all'analisi collegata"
          className="inline-flex items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/5 p-1 text-emerald-600 hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-colors dark:text-emerald-400"
          onClick={(e) => e.stopPropagation()}
        >
          <FileSearch className="h-3.5 w-3.5" />
        </Link>
      )
    case 'product':
      return (
        <span className="inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium text-foreground/75">
          {event.product.name}
        </span>
      )
    case 'environment':
      return <span className="block truncate text-sm text-muted-foreground">{event.environment.name}</span>
    case 'awsRegion':
      return (
        <span className="font-mono text-xs text-muted-foreground">
          {event.awsRegion}
        </span>
      )
    case 'awsAccountId':
      return (
        <span className="font-mono text-xs text-muted-foreground">
          {event.awsAccountId}
        </span>
      )
    case 'description':
      return event.description
        ? <span className="block truncate text-sm text-muted-foreground">{event.description}</span>
        : <span className="text-muted-foreground/40 text-sm">—</span>
    case 'alarm':
      return event.alarm
        ? (
          <Link
            href={`/products/${event.product.id}?tab=alarms`}
            className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/40 transition-colors max-w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <BookOpen className="h-3 w-3 shrink-0" />
            <span className="truncate">{event.alarm.name}</span>
          </Link>
        )
        : <span className="text-muted-foreground/40 text-sm">—</span>
    case 'reason':
      return event.reason
        ? <span className="block truncate text-sm text-muted-foreground">{event.reason}</span>
        : <span className="text-muted-foreground/40 text-sm">—</span>
    default:
      return null
  }
})
