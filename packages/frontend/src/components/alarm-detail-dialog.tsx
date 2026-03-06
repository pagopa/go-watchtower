'use client'

import { Bell, BookOpen, ExternalLink, Clock, Hash } from 'lucide-react'
import { sanitizeUrl } from '@/lib/sanitize-url'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'

// ─── Data type ────────────────────────────────────────────────────────────────

export interface AlarmDetailData {
  id:          string
  name:        string
  description: string | null
  productId:   string
  productName?: string
  runbook:     { id: string; name: string; link?: string | null } | null
  createdAt?:  string
  updatedAt?:  string
}

// ─── Component ────────────────────────────────────────────────────────────────

interface AlarmDetailDialogProps {
  open:    boolean
  onClose: () => void
  alarm:   AlarmDetailData | null
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function AlarmDetailDialog({ open, onClose, alarm }: AlarmDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg overflow-hidden p-0">

        {/* ── Header ── */}
        <div className="flex items-start gap-4 border-b border-border px-6 py-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bell className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <DialogTitle className="break-words text-base font-semibold leading-snug">
              {alarm?.name ?? ''}
            </DialogTitle>
            {alarm?.productName && (
              <Link
                href={`/products/${alarm.productId}?tab=alarms`}
                className="mt-1.5 inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium text-foreground/65 transition-colors hover:border-primary/40 hover:text-primary"
                onClick={onClose}
              >
                {alarm.productName}
              </Link>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        {alarm && (
          <div className="space-y-5 px-6 py-5">

            {/* Description */}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                Descrizione
              </p>
              {alarm.description ? (
                <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap">
                  {alarm.description}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground/45">
                  Nessuna descrizione disponibile.
                </p>
              )}
            </div>

            {/* Runbook */}
            {alarm.runbook ? (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  Runbook
                </p>
                <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3.5 py-2.5">
                  <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {alarm.runbook.name}
                  </span>
                  {alarm.runbook.link && (
                    <a
                      href={sanitizeUrl(alarm.runbook.link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Apri
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  Runbook
                </p>
                <p className="text-sm italic text-muted-foreground/45">Nessun runbook associato.</p>
              </div>
            )}

          </div>
        )}

        {/* ── Footer — metadata ── */}
        {alarm && (alarm.createdAt || alarm.id) && (
          <div className="space-y-1 border-t border-border/50 bg-muted/20 px-6 py-3">
            {alarm.createdAt && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
                <Clock className="h-3 w-3 shrink-0" />
                <span>
                  Creato il {fmtDate(alarm.createdAt)}
                  {alarm.updatedAt && alarm.updatedAt !== alarm.createdAt && (
                    <> · Aggiornato il {fmtDate(alarm.updatedAt)}</>
                  )}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/35">
              <Hash className="h-2.5 w-2.5 shrink-0" />
              <span className="break-all font-mono">{alarm.id}</span>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  )
}
