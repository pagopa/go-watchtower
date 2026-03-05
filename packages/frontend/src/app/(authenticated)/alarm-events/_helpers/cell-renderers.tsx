import type { ReactNode } from 'react'
import Link from 'next/link'
import type { AlarmEvent } from '@/lib/api-client'
import { AlarmRefPopover } from '../_components/alarm-ref-popover'

function formatDateTimeUTC(iso: string): string {
  try {
    return new Intl.DateTimeFormat('it-IT', {
      timeZone: 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso)) + ' UTC'
  } catch {
    return iso
  }
}

export function renderCell(columnId: string, event: AlarmEvent): ReactNode {
  switch (columnId) {
    case 'firedAt':
      return (
        <span className="font-mono text-xs tabular-nums">
          {formatDateTimeUTC(event.firedAt)}
        </span>
      )
    case 'name':
      return (
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate font-medium text-sm">{event.name}</span>
          {event.alarm && (
            <AlarmRefPopover alarm={event.alarm} productId={event.product.id} />
          )}
        </div>
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
            className="block truncate text-sm text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {event.alarm.name}
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
}
