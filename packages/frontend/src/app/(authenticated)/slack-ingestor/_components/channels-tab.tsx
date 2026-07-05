'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Hash, Loader2, Pencil, PlugZap, Search } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { api, type SlackIngestorChannel } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { PARSER_META, cursorStatusMeta, routingStatusLabel, type SlackParserId } from './labels'
import { ChannelEditSheet } from './channel-edit-sheet'

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('it-IT')
}

/** Tempo relativo compatto per l'ultima lettura riuscita (dettaglio esatto nel title). */
function timeAgo(value: string | null): string {
  if (!value) return 'mai'
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60_000)
  if (minutes < 1) return 'adesso'
  if (minutes < 60) return `${minutes} min fa`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours === 1 ? '1 ora fa' : `${hours} ore fa`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ieri'
  if (days < 30) return `${days} giorni fa`
  return formatDate(value)
}

/** Accento della riga: racconta lo stato del canale a colpo d'occhio. */
function channelAccent(channel: SlackIngestorChannel): { bar: string; dot: string; pulse: boolean } {
  if (channel.slackIngestorEnabled === false) return { bar: 'border-l-zinc-300 dark:border-l-zinc-700', dot: 'bg-zinc-400', pulse: false }
  if (channel.cursor?.lastStatus === 'FAILED') return { bar: 'border-l-rose-500', dot: 'bg-rose-500', pulse: true }
  if (channel.cursor?.lastStatus === 'SUCCESS') return { bar: 'border-l-emerald-500', dot: 'bg-emerald-500', pulse: false }
  return { bar: 'border-l-amber-400', dot: 'bg-amber-400', pulse: false }
}

/** Micro-colonna auto-descrittiva: etichetta sopra, valore sotto (niente header di tabella). */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  )
}

function ChannelRow({
  channel,
  canWrite,
  checking,
  onCheck,
  onEdit,
}: {
  channel: SlackIngestorChannel
  canWrite: boolean
  checking: boolean
  onCheck: () => void
  onEdit: () => void
}) {
  const enabled = channel.slackIngestorEnabled !== false
  const accent = channelAccent(channel)
  const cursorMeta = cursorStatusMeta(channel.cursor?.lastStatus)
  const parser = channel.slackParserId ? PARSER_META[channel.slackParserId as SlackParserId] : null

  return (
    <div className={cn('border-l-4 bg-card transition-colors hover:bg-muted/30', accent.bar, !enabled && 'opacity-70')}>
      <div className="grid items-center gap-x-6 gap-y-3 px-4 py-3 lg:grid-cols-[minmax(220px,1.3fr)_minmax(150px,1fr)_minmax(190px,1.2fr)_minmax(150px,1fr)_auto]">
        {/* Identità: ambiente + canale */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/50">
            <Hash className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium leading-tight">{channel.name}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {channel.slackChannelId ?? 'canale non impostato'}
            </p>
          </div>
        </div>

        <Field label="Parser">
          {parser ? parser.label : <span className="text-muted-foreground">Non configurato</span>}
        </Field>

        <Field label="Account AWS">
          <p className="truncate font-mono text-xs leading-5">
            {channel.defaultAwsAccountId ?? '—'}
            {channel.defaultAwsRegion && <span className="text-muted-foreground"> · {channel.defaultAwsRegion}</span>}
          </p>
          <p className="truncate text-xs text-muted-foreground">{routingStatusLabel(channel.routingStatus)}</p>
        </Field>

        <Field label="Ultima lettura">
          <span className="flex items-center gap-1.5">
            <span className="relative inline-flex h-2 w-2">
              {accent.pulse && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', accent.dot)} />}
              <span className={cn('relative inline-flex h-2 w-2 rounded-full', accent.dot)} />
            </span>
            <span className="text-sm font-medium">{enabled ? cursorMeta.label : 'Disabilitato'}</span>
            <span className="text-xs text-muted-foreground" title={formatDate(channel.cursor?.lastSuccessAt ?? null)}>
              · {timeAgo(channel.cursor?.lastSuccessAt ?? null)}
            </span>
          </span>
        </Field>

        {/* Azioni */}
        {canWrite && (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" disabled={checking} onClick={onCheck}>
              {checking ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PlugZap className="mr-1.5 h-4 w-4" />}
              Verifica accesso
            </Button>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="mr-1.5 h-4 w-4" />
              Modifica
            </Button>
          </div>
        )}
      </div>

      {channel.cursor?.lastError && (
        <p
          className="mx-4 mb-3 line-clamp-2 rounded-md bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-700 dark:text-rose-400"
          title={channel.cursor.lastError}
        >
          {channel.cursor.lastError}
        </p>
      )}
    </div>
  )
}

export function ChannelsTab({ canWrite }: { canWrite: boolean }) {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<SlackIngestorChannel | null>(null)
  const query = useQuery({ queryKey: qk.slackIngestor.channels, queryFn: api.getSlackIngestorChannels })
  const checkMutation = useMutation({
    mutationFn: api.checkSlackIngestorChannel,
    onSuccess: (result) =>
      toast.success(`Accesso Slack verificato${result.channel?.name ? `: #${result.channel.name}` : ''}`),
    onError: (error: Error) => toast.error(error.message),
  })

  const channels = useMemo(() => query.data ?? [], [query.data])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return channels
    return channels.filter((channel) =>
      [channel.product.name, channel.name, channel.slackChannelId ?? '', channel.slackParserId ?? '']
        .some((value) => value.toLowerCase().includes(needle))
    )
  }, [channels, search])

  // Raggruppa per prodotto preservando l'ordinamento del backend (prodotto, order)
  const byProduct = useMemo(() => {
    const groups = new Map<string, { name: string; channels: SlackIngestorChannel[] }>()
    for (const channel of filtered) {
      const group = groups.get(channel.product.id) ?? { name: channel.product.name, channels: [] }
      group.channels.push(channel)
      groups.set(channel.product.id, group)
    }
    return [...groups.entries()]
  }, [filtered])

  const active = channels.filter((channel) => channel.slackIngestorEnabled !== false).length
  const failing = channels.filter((channel) => channel.cursor?.lastStatus === 'FAILED').length

  return (
    <div className="space-y-5">
      {/* Testata: ricerca + sintesi */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filtra per prodotto, ambiente o canale"
          />
        </div>
        {!query.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              <span className="font-mono font-semibold text-foreground">{channels.length}</span> canali
            </span>
            <span aria-hidden>·</span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="font-mono font-semibold text-foreground">{active}</span> attivi
            </span>
            {failing > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  <span className="font-mono font-semibold text-foreground">{failing}</span> in errore
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((index) => <Skeleton key={index} className="h-40 w-full rounded-lg" />)}
        </div>
      ) : byProduct.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-14 text-center text-sm text-muted-foreground">
          {search ? 'Nessun canale corrisponde al filtro.' : 'Nessun canale configurato: imposta il channel ID Slack sugli ambienti dei prodotti.'}
        </div>
      ) : (
        byProduct.map(([productId, group]) => (
          <section key={productId} className="space-y-2">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide">{group.name}</h2>
              <span className="text-xs text-muted-foreground">
                {group.channels.length === 1 ? '1 canale' : `${group.channels.length} canali`}
              </span>
              <Badge variant="outline" className="ml-auto font-normal text-muted-foreground">
                {group.channels.filter((channel) => channel.slackIngestorEnabled !== false).length} attivi
              </Badge>
            </div>
            <div className="divide-y overflow-hidden rounded-lg border">
              {group.channels.map((channel) => (
                <ChannelRow
                  key={channel.id}
                  channel={channel}
                  canWrite={canWrite}
                  checking={checkMutation.isPending && checkMutation.variables === channel.id}
                  onCheck={() => checkMutation.mutate(channel.id)}
                  onEdit={() => setEditing(channel)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <ChannelEditSheet channel={editing} onOpenChange={(open) => { if (!open) setEditing(null) }} />
    </div>
  )
}
