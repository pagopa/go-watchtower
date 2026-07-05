'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AWS_ACCOUNT_ID_PATTERN, AWS_REGION_PATTERN, SLACK_CHANNEL_ID_PATTERN } from '@go-watchtower/shared'
import { api, type SlackIngestorChannel } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { PARSER_META, SLACK_PARSER_IDS, type SlackParserId } from './labels'
import { RichSelect } from './rich-select'

interface FormState {
  slackIngestorEnabled: boolean
  slackChannelId: string
  slackParserId: SlackParserId | ''
  defaultAwsAccountId: string
  defaultAwsRegion: string
}

function toFormState(channel: SlackIngestorChannel): FormState {
  return {
    slackIngestorEnabled: channel.slackIngestorEnabled ?? false,
    slackChannelId: channel.slackChannelId ?? '',
    slackParserId: (channel.slackParserId as SlackParserId | null) ?? '',
    defaultAwsAccountId: channel.defaultAwsAccountId ?? '',
    defaultAwsRegion: channel.defaultAwsRegion ?? '',
  }
}

/** Replica lato client le regole di validateSlackEnvironment del backend (stessi pattern shared). */
function validate(form: FormState): string | null {
  if (form.slackChannelId && !SLACK_CHANNEL_ID_PATTERN.test(form.slackChannelId)) return 'Channel ID Slack non valido (es. C0123ABCDEF)'
  if (form.defaultAwsAccountId && !AWS_ACCOUNT_ID_PATTERN.test(form.defaultAwsAccountId)) return 'L’account AWS deve contenere 12 cifre'
  if (form.defaultAwsRegion && !AWS_REGION_PATTERN.test(form.defaultAwsRegion)) return 'Regione AWS non valida (es. eu-south-1)'
  if (
    form.slackIngestorEnabled &&
    (!form.slackChannelId || !form.slackParserId || !form.defaultAwsAccountId || !form.defaultAwsRegion)
  ) {
    return 'Per abilitare l’ingestor servono canale, parser, account e regione'
  }
  return null
}

export function ChannelEditSheet({
  channel,
  onOpenChange,
}: {
  /** Environment da modificare; null = pannello chiuso. */
  channel: SlackIngestorChannel | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState | null>(null)

  useEffect(() => {
    setForm(channel ? toFormState(channel) : null)
  }, [channel])

  const mutation = useMutation({
    mutationFn: (data: FormState) =>
      api.updateEnvironment(channel!.productId, channel!.id, {
        slackIngestorEnabled: data.slackIngestorEnabled,
        slackChannelId: data.slackChannelId || null,
        slackParserId: data.slackParserId || null,
        defaultAwsAccountId: data.defaultAwsAccountId || null,
        defaultAwsRegion: data.defaultAwsRegion || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.slackIngestor.channels })
      void queryClient.invalidateQueries({ queryKey: qk.products.environments(channel!.productId) })
      toast.success('Configurazione del canale aggiornata')
      onOpenChange(false)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const validationError = form ? validate(form) : null

  return (
    <Sheet open={channel !== null} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-md">
        {channel && form && (
          <div className="flex h-full flex-col">
            <div className="border-b px-6 py-4">
              <SheetTitle>Configura canale Slack</SheetTitle>
              <SheetDescription>
                {channel.product.name} / {channel.name}
              </SheetDescription>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="channel-enabled">Ingestor abilitato</Label>
                  <p className="text-xs text-muted-foreground">
                    Se attivo, i messaggi del canale vengono importati come eventi allarme.
                  </p>
                </div>
                <Switch
                  id="channel-enabled"
                  checked={form.slackIngestorEnabled}
                  onCheckedChange={(checked) => setForm({ ...form, slackIngestorEnabled: checked })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="channel-id">Channel ID Slack</Label>
                <Input
                  id="channel-id"
                  className="font-mono"
                  value={form.slackChannelId}
                  placeholder="C0123ABCDEF"
                  onChange={(event) => setForm({ ...form, slackChannelId: event.target.value.trim() })}
                />
                <p className="text-xs text-muted-foreground">
                  Lo trovi in Slack: dettagli canale → “Copia ID canale”.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Parser</Label>
                <RichSelect
                  value={form.slackParserId}
                  placeholder="Seleziona il parser…"
                  options={SLACK_PARSER_IDS.map((parser) => ({
                    value: parser as SlackParserId | '',
                    label: PARSER_META[parser].label,
                    description: PARSER_META[parser].description,
                  }))}
                  onValueChange={(parser) => setForm({ ...form, slackParserId: parser })}
                />
                <p className="text-xs text-muted-foreground">
                  Determina come vengono interpretati i messaggi di allarme del canale.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="aws-account">Account AWS</Label>
                  <Input
                    id="aws-account"
                    className="font-mono"
                    value={form.defaultAwsAccountId}
                    placeholder="123456789012"
                    onChange={(event) => setForm({ ...form, defaultAwsAccountId: event.target.value.trim() })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="aws-region">Regione AWS</Label>
                  <Input
                    id="aws-region"
                    className="font-mono"
                    value={form.defaultAwsRegion}
                    placeholder="eu-south-1"
                    onChange={(event) => setForm({ ...form, defaultAwsRegion: event.target.value.trim() })}
                  />
                </div>
              </div>

              {validationError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{validationError}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Annulla
              </Button>
              <Button
                disabled={Boolean(validationError) || mutation.isPending}
                onClick={() => mutation.mutate(form)}
              >
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salva
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
