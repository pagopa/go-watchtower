'use client'

import { useEffect, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Search, Loader2, Bot, Zap } from 'lucide-react'
import { api, type AlarmEvent } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useRunAutomaticRunbook } from './execute-runbook-action'

/**
 * Picker per lanciare un runbook automatico dalla console (dove non c'è
 * un'occorrenza nel contesto): cerca un allarme scattato per nome e avvia
 * l'esecuzione per quell'occorrenza. Su successo chiama `onLaunched` con l'id
 * della nuova esecuzione, così la console può aprirne il dettaglio.
 */
export function ExecuteRunbookPicker({
  open, onOpenChange, onLaunched,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLaunched?: (executionId: string) => void
}) {
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const run = useRunAutomaticRunbook()

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 350)
    return () => clearTimeout(t)
  }, [term])

  useEffect(() => {
    if (!open) { setTerm(''); setDebounced('') }
  }, [open])

  const params = { pageSize: 20, sortBy: 'firedAt' as const, ...(debounced ? { name: debounced } : {}) }
  const { data, isFetching } = useQuery({
    queryKey: qk.alarmEvents.list({ picker: 'execute-runbook', ...params }),
    queryFn: () => api.getAlarmEvents(params),
    enabled: open,
    placeholderData: keepPreviousData,
  })
  const events = data?.data ?? []

  const launch = (event: AlarmEvent) => {
    run.mutate(event.id, {
      onSuccess: (execution) => { onLaunched?.(execution.id); onOpenChange(false) },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" /> Esegui runbook automatico
          </DialogTitle>
          <DialogDescription>
            Cerca un allarme scattato e avvia il runbook automatico per quell’occorrenza.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Cerca per nome allarme…"
            className="pl-9"
          />
        </div>

        <div className="max-h-[360px] min-h-[160px] overflow-y-auto rounded-lg border">
          {isFetching && events.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Ricerca…
            </div>
          ) : events.length === 0 ? (
            <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {debounced ? 'Nessun allarme scattato corrisponde alla ricerca.' : 'Nessun allarme scattato recente.'}
            </div>
          ) : (
            <ul className="divide-y">
              {events.map((event) => {
                const launchable = !!event.alarmId
                const pending = run.isPending && run.variables === event.id
                return (
                  <li key={event.id} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/40">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <span className="truncate">{event.alarm?.name ?? event.name}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {event.product.name} · {event.environment.name} ·{' '}
                        {new Date(event.firedAt).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={launchable ? 'secondary' : 'ghost'}
                      disabled={!launchable || pending}
                      title={launchable ? 'Esegui' : 'Questa occorrenza non ha un allarme collegato'}
                      onClick={() => launch(event)}
                    >
                      {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Bot className="mr-1 h-4 w-4" />}
                      Esegui
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
