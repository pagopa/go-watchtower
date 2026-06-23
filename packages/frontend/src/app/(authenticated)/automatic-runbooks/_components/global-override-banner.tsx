'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ShieldAlert, Power } from 'lucide-react'
import { api, type AutomationMode } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { usePermissions } from '@/hooks/use-permissions'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MODE_LABELS } from './badges'

const NONE = '__NONE__'

const OPTIONS: readonly { value: string; label: string }[] = [
  { value: NONE, label: 'Nessuno (disattivato)' },
  { value: 'SHADOW', label: `${MODE_LABELS.SHADOW} — ferma l’applicazione` },
  { value: 'APPLY_KNOWN', label: `${MODE_LABELS.APPLY_KNOWN} — forza solo casi noti` },
  { value: 'APPLY_ALL', label: `${MODE_LABELS.APPLY_ALL} — forza sempre` },
]

/**
 * Kill-switch globale del Runbook Automation. Quando attivo, sovrascrive al
 * completamento il modo di TUTTE le esecuzioni non concluse (anche quelle già
 * avviate), ignorando il modo con cui sono state lanciate. Lo stato arriva dalle
 * stats (lette con permesso runbook); la modifica richiede SYSTEM_SETTING:write.
 */
export function GlobalOverrideBanner({ modeOverride }: { modeOverride: AutomationMode | null }) {
  const { can } = usePermissions()
  const canWrite = can('SYSTEM_SETTING', 'write')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (value: string) => api.updateSetting('automation.modeOverride', value),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.automaticExecutions.stats })
      void queryClient.invalidateQueries({ queryKey: qk.settings.detail('automation.modeOverride') })
      toast.success('Override globale aggiornato')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const active = modeOverride !== null
  if (!active && !canWrite) return null

  const selector = canWrite ? (
    <Select
      value={modeOverride ?? NONE}
      onValueChange={(v) => mutation.mutate(v === NONE ? '' : v)}
      disabled={mutation.isPending}
    >
      <SelectTrigger className="h-8 w-64 bg-background text-sm"><SelectValue /></SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  ) : null

  if (active) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
        <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            Override globale attivo: {MODE_LABELS[modeOverride]}
          </p>
          <p className="text-xs text-muted-foreground">
            Tutte le esecuzioni applicano <strong>{MODE_LABELS[modeOverride]}</strong> al completamento,
            ignorando il modo con cui sono state lanciate.
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            {selector}
            <Button size="sm" variant="outline" onClick={() => mutation.mutate('')} disabled={mutation.isPending}>
              Disattiva
            </Button>
          </div>
        )}
      </div>
    )
  }

  // Non attivo + permesso di scrittura: controllo discreto per attivarlo.
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2">
      <Power className="h-4 w-4 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">Override globale (kill-switch): nessuno</span>
      <div className="ml-auto">{selector}</div>
    </div>
  )
}
