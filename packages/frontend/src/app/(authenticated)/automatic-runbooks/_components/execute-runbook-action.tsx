'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Bot } from 'lucide-react'
import { api } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'

/** Target del lancio: l'occorrenza (AlarmEvent) su cui eseguire il runbook. */
export interface RunTarget {
  alarmEventId: string
  alarmName?: string | null
  /** false se l'AlarmEvent non ha un allarme collegato → non lanciabile. */
  hasAlarm: boolean
}

/**
 * Logica condivisa di lancio "Esegui runbook automatico" (Flow 2, trigger
 * WATCHTOWER_UI). Avvia l'esecuzione e, in caso di successo, offre un toast
 * "Apri" che fa deep-link alla console sull'esecuzione creata.
 */
export function useRunAutomaticRunbook() {
  const queryClient = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (alarmEventId: string) => api.createAutomaticExecution({ alarmEventId }),
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

const TITLE = 'Esegui runbook automatico'
const DESC =
  'Crea una nuova esecuzione automatica per questa occorrenza. L’esito (con il modo di rollout corrente) potrà generare o aggiornare un’analisi.'

/**
 * Dialog di conferma CONTROLLATO: usato quando il trigger vive in un menu (es.
 * azioni di riga), dove non si può annidare l'AlertDialog. Il parent tiene lo
 * stato `target` e lo azzera in `onOpenChange`.
 */
export function ExecuteRunbookConfirmDialog({
  target, onOpenChange,
}: {
  target: RunTarget | null
  onOpenChange: (open: boolean) => void
}) {
  const run = useRunAutomaticRunbook()
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
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction
            disabled={run.isPending}
            onClick={() => {
              if (target) run.mutate(target.alarmEventId, { onSettled: () => onOpenChange(false) })
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
 * menu/dropdown (pannelli di dettaglio, righe di tabella, picker). Non rende nulla
 * se l'occorrenza non ha un allarme collegato.
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
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
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
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={run.isPending}
              onClick={() => run.mutate(target.alarmEventId, { onSettled: () => setOpen(false) })}
            >
              Esegui
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
