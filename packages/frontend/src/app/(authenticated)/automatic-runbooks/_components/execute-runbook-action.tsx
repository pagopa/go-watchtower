'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Bot } from 'lucide-react'
import { api, type AutomationMode } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MODE_LABELS } from './badges'

/** Target del lancio: l'occorrenza (AlarmEvent) su cui eseguire il runbook. */
export interface RunTarget {
  alarmEventId: string
  alarmName?: string | null
  /** false se l'AlarmEvent non ha un allarme collegato → non lanciabile. */
  hasAlarm: boolean
}

/**
 * Logica condivisa di lancio "Esegui runbook automatico" (Flow 2, trigger
 * WATCHTOWER_UI). Avvia l'esecuzione (eventualmente con un modo forzato) e, in
 * caso di successo, offre un toast "Apri" che fa deep-link all'esecuzione creata.
 */
export function useRunAutomaticRunbook() {
  const queryClient = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (vars: { alarmEventId: string; mode?: AutomationMode }) => api.createAutomaticExecution(vars),
    onSuccess: (execution) => {
      void queryClient.invalidateQueries({ queryKey: qk.automaticExecutions.root })
      toast.success('Runbook automatico avviato', {
        description: 'L’esecuzione è in coda di dispatch.',
        action: {
          label: 'Apri',
          onClick: () => router.push(`/automatic-runbooks?execution=${execution.id}`),
        },
      })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

const DEFAULT_VALUE = '__DEFAULT__'

/** Etichetta del default di sistema (best-effort: richiede la lettura impostazioni). */
function useDefaultModeLabel(enabled: boolean): string | undefined {
  const { data } = useQuery({
    queryKey: qk.settings.detail('automation.defaultMode'),
    queryFn: () => api.getSetting('automation.defaultMode'),
    enabled,
    retry: false,
    staleTime: 60_000,
  })
  const v = typeof data?.value === 'string' ? data.value : undefined
  return v && v in MODE_LABELS ? MODE_LABELS[v as AutomationMode] : undefined
}

/**
 * Selettore del modo per il lancio: "Predefinito di sistema" (nessun override →
 * il backend usa il default) + i tre modi espliciti.
 */
export function ModeSelect({ value, onChange, defaultLabel }: {
  value: AutomationMode | undefined
  onChange: (m: AutomationMode | undefined) => void
  defaultLabel?: string
}) {
  return (
    <Select
      value={value ?? DEFAULT_VALUE}
      onValueChange={(v) => onChange(v === DEFAULT_VALUE ? undefined : (v as AutomationMode))}
    >
      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT_VALUE}>Predefinito di sistema{defaultLabel ? ` · ${defaultLabel}` : ''}</SelectItem>
        <SelectItem value="SHADOW">{MODE_LABELS.SHADOW} · solo osservazione</SelectItem>
        <SelectItem value="APPLY_KNOWN">{MODE_LABELS.APPLY_KNOWN} · solo casi noti</SelectItem>
        <SelectItem value="APPLY_ALL">{MODE_LABELS.APPLY_ALL} · sempre</SelectItem>
      </SelectContent>
    </Select>
  )
}

/** Campo "Modo di esecuzione" da inserire nel dialog di conferma. */
function ModeField({ mode, setMode, enabled }: {
  mode: AutomationMode | undefined
  setMode: (m: AutomationMode | undefined) => void
  enabled: boolean
}) {
  const defaultLabel = useDefaultModeLabel(enabled)
  return (
    <div className="pt-1">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Modo di esecuzione</span>
      <ModeSelect value={mode} onChange={setMode} defaultLabel={defaultLabel} />
    </div>
  )
}

const TITLE = 'Esegui runbook automatico'
const DESC =
  'Crea una nuova esecuzione automatica per questa occorrenza. L’esito (col modo scelto) potrà generare o aggiornare un’analisi.'

/**
 * Dialog di conferma CONTROLLATO: usato quando il trigger vive in un menu (es.
 * azioni di riga), dove non si può annidare l'AlertDialog. Resta sempre montato
 * (l'hook mutation deve sopravvivere alla chiusura) e si pilota con `target`.
 */
export function ExecuteRunbookConfirmDialog({
  target, onOpenChange,
}: {
  target: RunTarget | null
  onOpenChange: (open: boolean) => void
}) {
  const run = useRunAutomaticRunbook()
  const [mode, setMode] = useState<AutomationMode | undefined>(undefined)
  useEffect(() => { if (target) setMode(undefined) }, [target])
  return (
    <AlertDialog open={target !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{TITLE}</AlertDialogTitle>
          <AlertDialogDescription>
            {target?.alarmName ? <><span className="font-medium text-foreground">{target.alarmName}</span> — </> : null}
            {DESC}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ModeField mode={mode} setMode={setMode} enabled={target !== null} />
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction
            disabled={run.isPending}
            onClick={() => {
              if (target) run.mutate({ alarmEventId: target.alarmEventId, mode }, { onSettled: () => onOpenChange(false) })
            }}
          >
            Esegui
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Pulsante self-contained (apre la conferma da sé). Usalo dove NON sei dentro un
 * menu/dropdown (pannelli di dettaglio, righe di tabella). Non rende nulla se
 * l'occorrenza non ha un allarme collegato.
 */
export function ExecuteRunbookButton({
  target, size = 'sm', variant = 'secondary', label = TITLE, iconOnly = false, className,
}: {
  target: RunTarget
  size?: 'sm' | 'default'
  variant?: 'secondary' | 'outline' | 'default' | 'ghost'
  label?: string
  iconOnly?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<AutomationMode | undefined>(undefined)
  const run = useRunAutomaticRunbook()
  if (!target.hasAlarm) return null
  return (
    <>
      <Button
        type="button"
        size={iconOnly ? 'icon' : size}
        variant={variant}
        className={className}
        title={label}
        onClick={(e) => { e.stopPropagation(); setMode(undefined); setOpen(true) }}
      >
        <Bot className={iconOnly ? 'h-4 w-4' : 'mr-1 h-4 w-4'} />
        {!iconOnly && label}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{TITLE}</AlertDialogTitle>
            <AlertDialogDescription>
              {target.alarmName ? <><span className="font-medium text-foreground">{target.alarmName}</span> — </> : null}
              {DESC}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ModeField mode={mode} setMode={setMode} enabled={open} />
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={run.isPending}
              onClick={() => run.mutate({ alarmEventId: target.alarmEventId, mode }, { onSettled: () => setOpen(false) })}
            >
              Esegui
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
