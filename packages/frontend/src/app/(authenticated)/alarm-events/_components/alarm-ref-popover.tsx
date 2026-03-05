'use client'

import Link from 'next/link'
import { Bell, BookOpen, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

type EmbeddedAlarm = {
  id: string
  name: string
  description: string | null
  runbook: { id: string; name: string; link: string } | null
}

interface AlarmRefPopoverProps {
  alarm: EmbeddedAlarm
  productId: string
}

export function AlarmRefPopover({ alarm, productId }: AlarmRefPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 text-primary/60 hover:text-primary hover:bg-primary/10"
          title="Dettaglio allarme collegato"
          onClick={(e) => e.stopPropagation()}
        >
          <Bell className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-2.5 border-b border-border/60 px-3.5 py-3">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Bell className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
              Allarme collegato
            </p>
            <p className="mt-0.5 break-words text-sm font-semibold leading-snug">
              {alarm.name}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-3 px-3.5 py-3">
          {alarm.description && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {alarm.description}
            </p>
          )}

          {alarm.runbook && (
            <div className="flex items-center gap-2">
              <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
              <a
                href={alarm.runbook.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-1 text-xs text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="truncate">{alarm.runbook.name}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </div>
          )}
        </div>

        {/* Footer — link al prodotto */}
        <div className="border-t border-border/60 px-3.5 py-2.5">
          <Link
            href={`/products/${productId}?tab=alarms`}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            Vai alla lista allarmi del prodotto
            <ExternalLink className="h-3 w-3 shrink-0" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
