'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Loader2, Bell, BookOpen, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { api, type Alarm, type Runbook } from '@/lib/api-client'
import { AlarmDetailDialog, type AlarmDetailData } from '@/components/alarm-detail-dialog'
import { usePermissions } from '@/hooks/use-permissions'
import { useSortable } from '@/hooks/use-sortable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'

const alarmSchema = z.object({
  name: z.string().min(1, 'Il nome è obbligatorio'),
  description: z.string().optional(),
  runbookId: z.string().optional(),
})

type AlarmFormData = z.infer<typeof alarmSchema>

const NO_RUNBOOK_VALUE = '__none__'

interface AlarmsTabProps {
  productId: string
}

export function AlarmsTab({ productId }: AlarmsTabProps) {
  const queryClient = useQueryClient()
  const { can, isLoading: permissionsLoading } = usePermissions()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editItem, setEditItem] = useState<Alarm | null>(null)
  const [deleteItem, setDeleteItem] = useState<Alarm | null>(null)
  const [detailData, setDetailData] = useState<AlarmDetailData | null>(null)

  const canWrite = !permissionsLoading && can('ALARM', 'write')
  const canDelete = !permissionsLoading && can('ALARM', 'delete')

  const {
    data: alarms,
    isLoading,
    error,
  } = useQuery<Alarm[]>({
    queryKey: ['products', productId, 'alarms'],
    queryFn: () => api.getAlarms(productId),
  })

  const { data: runbooks } = useQuery<Runbook[]>({
    queryKey: ['products', productId, 'runbooks'],
    queryFn: () => api.getRunbooks(productId),
  })

  type AlarmSortKey = 'name'
  const { sortedData: sortedAlarms, sortConfig, requestSort } = useSortable<Alarm, AlarmSortKey>(alarms, 'name')

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<AlarmFormData>({
    resolver: zodResolver(alarmSchema),
    defaultValues: { name: '', description: '', runbookId: undefined },
  })

  const handleViewDetail = (alarm: Alarm) => {
    const fullRunbook = runbooks?.find((r) => r.id === alarm.runbookId)
    setDetailData({
      id:          alarm.id,
      name:        alarm.name,
      description: alarm.description,
      productId:   alarm.productId,
      runbook:     fullRunbook
        ? { id: fullRunbook.id, name: fullRunbook.name, link: fullRunbook.link }
        : alarm.runbook ?? null,
      createdAt:   alarm.createdAt,
      updatedAt:   alarm.updatedAt,
    })
  }

  const handleEdit = (item: Alarm) => {
    reset({
      name: item.name,
      description: item.description || '',
      runbookId: item.runbookId || undefined,
    })
    setEditItem(item)
  }

  const createMutation = useMutation({
    mutationFn: (data: AlarmFormData) =>
      api.createAlarm(productId, {
        name: data.name,
        description: data.description,
        runbookId: data.runbookId || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', productId, 'alarms'] })
      toast.success('Allarme creato con successo')
      setShowCreateDialog(false)
      reset()
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante la creazione')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AlarmFormData }) =>
      api.updateAlarm(productId, id, {
        name: data.name,
        description: data.description,
        runbookId: data.runbookId || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', productId, 'alarms'] })
      toast.success('Allarme aggiornato con successo')
      setEditItem(null)
      reset()
    },
    onError: (error: Error) => {
      toast.error(error.message || "Errore durante l'aggiornamento")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteAlarm(productId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', productId, 'alarms'] })
      toast.success('Allarme eliminato con successo')
      setDeleteItem(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Errore durante l'eliminazione")
    },
  })

  const isDialogOpen = showCreateDialog || !!editItem
  const isMutating = createMutation.isPending || updateMutation.isPending

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setShowCreateDialog(false)
      setEditItem(null)
      reset({ name: '', description: '', runbookId: undefined })
    }
  }

  const onSubmit = (data: AlarmFormData) => {
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-36 rounded-md" />
        </div>
        <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3 opacity-60" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <p className="py-4 text-sm text-destructive">
        Errore durante il caricamento degli allarmi.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{alarms?.length ?? 0}</span>
            {' '}allarmi
          </span>
          <button
            onClick={() => requestSort('name')}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {sortConfig?.key === 'name'
              ? sortConfig.direction === 'asc'
                ? <ArrowUp className="h-3 w-3" />
                : <ArrowDown className="h-3 w-3" />
              : <ArrowUpDown className="h-3 w-3" />}
            Nome
          </button>
        </div>
        {canWrite && (
          <Button
            size="sm"
            onClick={() => {
              reset({ name: '', description: '', runbookId: undefined })
              setShowCreateDialog(true)
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Nuovo Allarme
          </Button>
        )}
      </div>

      {/* List */}
      {sortedAlarms && sortedAlarms.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
          {sortedAlarms.map((alarm) => (
            <li
              key={alarm.id}
              className="group relative flex items-center gap-3 bg-card px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
              onClick={() => handleViewDetail(alarm)}
            >
              <span
                className="pointer-events-none absolute inset-y-0 left-0 w-0.5 rounded-r-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{alarm.name}</p>
                {alarm.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">{alarm.description}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {alarm.runbook && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground">
                    <BookOpen className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate max-w-[120px]">{alarm.runbook.name}</span>
                  </span>
                )}
                {(canWrite || canDelete) && (
                  <div
                    className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleEdit(alarm)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setDeleteItem(alarm)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
            <Bell className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Nessun allarme configurato</p>
          <p className="mt-1.5 text-sm text-muted-foreground">Aggiungi un allarme per iniziare.</p>
          {canWrite && (
            <Button
              size="sm"
              className="mt-5"
              onClick={() => {
                reset({ name: '', description: '', runbookId: undefined })
                setShowCreateDialog(true)
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Nuovo Allarme
            </Button>
          )}
        </div>
      )}

      <AlarmDetailDialog
        open={!!detailData}
        onClose={() => setDetailData(null)}
        alarm={detailData}
      />

      <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted shrink-0">
                <Bell className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <DialogTitle className="text-base">
                  {editItem ? 'Modifica Allarme' : 'Nuovo Allarme'}
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  {editItem
                    ? "Modifica i dettagli dell'allarme."
                    : 'Aggiungi un nuovo allarme al prodotto.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label htmlFor="alarm-name">Nome</Label>
              <Input
                id="alarm-name"
                placeholder="es. CPU > 90%"
                {...register('name')}
                disabled={isMutating}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="alarm-runbook">
                Runbook associato
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(opzionale)</span>
              </Label>
              <Controller
                name="runbookId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value || NO_RUNBOOK_VALUE}
                    onValueChange={(val) => field.onChange(val === NO_RUNBOOK_VALUE ? undefined : val)}
                    disabled={isMutating}
                  >
                    <SelectTrigger id="alarm-runbook">
                      <SelectValue placeholder="Nessun runbook" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_RUNBOOK_VALUE}>Nessuno</SelectItem>
                      {runbooks?.map((rb) => (
                        <SelectItem key={rb.id} value={rb.id}>
                          {rb.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="alarm-description">
                Descrizione
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(opzionale)</span>
              </Label>
              <Textarea
                id="alarm-description"
                placeholder="Descrizione dell'allarme"
                rows={3}
                {...register('description')}
                disabled={isMutating}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogClose(false)}
                disabled={isMutating}
              >
                Annulla
              </Button>
              <Button type="submit" disabled={isMutating}>
                {isMutating && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editItem ? 'Salva modifiche' : 'Crea allarme'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare l&apos;allarme &quot;{deleteItem?.name}&quot;?
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
