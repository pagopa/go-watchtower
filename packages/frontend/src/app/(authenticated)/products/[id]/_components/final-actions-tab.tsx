'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Loader2, CheckCircle2, Minus } from 'lucide-react'
import { toast } from 'sonner'
import { api, type FinalAction } from '@/lib/api-client'
import { usePermissions } from '@/hooks/use-permissions'
import { useSortable } from '@/hooks/use-sortable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { SortableTableHead } from '@/components/ui/sortable-table-head'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

const finalActionSchema = z.object({
  name: z.string().min(1, 'Il nome è obbligatorio'),
  description: z.string().optional(),
  order: z.coerce.number().min(0, "L'ordine deve essere >= 0").optional(),
  isOther: z.boolean().optional(),
})

type FinalActionFormData = z.infer<typeof finalActionSchema>

interface FinalActionsTabProps {
  productId: string
}

export function FinalActionsTab({ productId }: FinalActionsTabProps) {
  const queryClient = useQueryClient()
  const { can, isLoading: permissionsLoading } = usePermissions()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editItem, setEditItem] = useState<FinalAction | null>(null)
  const [deleteItem, setDeleteItem] = useState<FinalAction | null>(null)

  const canWrite = !permissionsLoading && can('FINAL_ACTION', 'write')
  const canDelete = !permissionsLoading && can('FINAL_ACTION', 'delete')

  const {
    data: finalActions,
    isLoading,
    error,
  } = useQuery<FinalAction[]>({
    queryKey: ['products', productId, 'final-actions'],
    queryFn: () => api.getFinalActions(productId),
  })

  type FinalActionSortKey = 'name' | 'order' | 'isOther'
  const { sortedData: sortedFinalActions, sortConfig, requestSort } = useSortable<FinalAction, FinalActionSortKey>(finalActions, 'order')

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FinalActionFormData>({
    resolver: zodResolver(finalActionSchema) as Resolver<FinalActionFormData>,
    defaultValues: { name: '', description: '', order: 0, isOther: false },
  })

  const handleEdit = (item: FinalAction) => {
    reset({
      name: item.name,
      description: item.description || '',
      order: item.order,
      isOther: item.isOther,
    })
    setEditItem(item)
  }

  const createMutation = useMutation({
    mutationFn: (data: FinalActionFormData) => api.createFinalAction(productId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', productId, 'final-actions'] })
      toast.success('Azione finale creata con successo')
      setShowCreateDialog(false)
      reset()
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante la creazione')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: FinalActionFormData }) =>
      api.updateFinalAction(productId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', productId, 'final-actions'] })
      toast.success('Azione finale aggiornata con successo')
      setEditItem(null)
      reset()
    },
    onError: (error: Error) => {
      toast.error(error.message || "Errore durante l'aggiornamento")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteFinalAction(productId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', productId, 'final-actions'] })
      toast.success('Azione finale eliminata con successo')
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
      reset({ name: '', description: '', order: 0, isOther: false })
    }
  }

  const onSubmit = (data: FinalActionFormData) => {
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
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-44 rounded-md" />
        </div>
        <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
          {[0, 1, 2].map((n) => (
            <div key={`skeleton-${n}`} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-6 w-6 rounded shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2 opacity-60" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <p className="py-4 text-sm text-destructive">
        Errore durante il caricamento delle azioni finali.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground">{finalActions?.length ?? 0}</span>
          {' '}azioni finali
        </span>
        {canWrite && (
          <Button
            size="sm"
            onClick={() => {
              reset({ name: '', description: '', order: 0, isOther: false })
              setShowCreateDialog(true)
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Nuova Azione Finale
          </Button>
        )}
      </div>

      {sortedFinalActions && sortedFinalActions.length > 0 ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <SortableTableHead
                  columnKey="order"
                  sortConfig={sortConfig}
                  onSort={requestSort}
                  className="w-16 text-center"
                >
                  #
                </SortableTableHead>
                <SortableTableHead columnKey="name" sortConfig={sortConfig} onSort={requestSort}>
                  Nome
                </SortableTableHead>
                <SortableTableHead
                  columnKey="isOther"
                  sortConfig={sortConfig}
                  onSort={requestSort}
                  className="w-28"
                >
                  Tipo
                </SortableTableHead>
                {(canWrite || canDelete) && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedFinalActions.map((finalAction) => (
                <TableRow key={finalAction.id} className="group hover:bg-muted/30">
                  <TableCell className="text-center">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-muted text-xs font-medium tabular-nums text-muted-foreground">
                      {finalAction.order}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{finalAction.name}</div>
                    {finalAction.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{finalAction.description}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={finalAction.isOther ? 'secondary' : 'default'} className="text-xs">
                      {finalAction.isOther ? 'Altro' : 'Standard'}
                    </Badge>
                  </TableCell>
                  {(canWrite || canDelete) && (
                    <TableCell>
                      <div className="flex gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleEdit(finalAction)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setDeleteItem(finalAction)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
            <CheckCircle2 className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Nessuna azione finale configurata</p>
          <p className="mt-1.5 text-sm text-muted-foreground">Aggiungi un&apos;azione finale per iniziare.</p>
          {canWrite && (
            <Button
              size="sm"
              className="mt-5"
              onClick={() => {
                reset({ name: '', description: '', order: 0, isOther: false })
                setShowCreateDialog(true)
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Nuova Azione Finale
            </Button>
          )}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted shrink-0">
                <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <DialogTitle className="text-base">
                  {editItem ? 'Modifica Azione Finale' : 'Nuova Azione Finale'}
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  {editItem
                    ? "Modifica i dettagli dell'azione finale."
                    : 'Aggiungi una nuova azione finale al prodotto.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label htmlFor="final-action-name">Nome</Label>
              <Input
                id="final-action-name"
                placeholder="es. Risolto, In corso, Falso positivo"
                {...register('name')}
                disabled={isMutating}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="final-action-order">Ordine</Label>
              <div className="inline-flex items-center rounded-lg border border-input overflow-hidden bg-background">
                <button
                  type="button"
                  disabled={isMutating || (watch('order') ?? 0) <= 0}
                  onClick={() => setValue('order', Math.max(0, (watch('order') ?? 0) - 1))}
                  className="flex h-9 w-9 items-center justify-center border-r border-input text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="flex h-9 min-w-[3rem] items-center justify-center px-4 text-sm font-medium tabular-nums">
                  {watch('order') ?? 0}
                </span>
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() => setValue('order', (watch('order') ?? 0) + 1)}
                  className="flex h-9 w-9 items-center justify-center border-l border-input text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {errors.order && (
                <p className="text-xs text-destructive">{errors.order.message}</p>
              )}
            </div>
            <label
              htmlFor="final-action-is-other"
              className={`flex items-center justify-between rounded-lg border border-input px-4 py-3 cursor-pointer transition-colors ${
                watch('isOther') ? 'bg-muted/60 border-primary/30' : 'bg-background hover:bg-muted/30'
              }`}
            >
              <div>
                <p className="text-sm font-medium">Tipo &quot;Altro&quot;</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Indica che questa azione è una voce generica residuale
                </p>
              </div>
              <Switch
                id="final-action-is-other"
                checked={watch('isOther') || false}
                onCheckedChange={(checked) => setValue('isOther', checked)}
                disabled={isMutating}
              />
            </label>
            <div className="space-y-2">
              <Label htmlFor="final-action-description">
                Descrizione
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(opzionale)</span>
              </Label>
              <Textarea
                id="final-action-description"
                placeholder="Descrizione dell'azione finale"
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
                {editItem ? 'Salva modifiche' : 'Crea azione'}
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
              Sei sicuro di voler eliminare l&apos;azione finale &quot;{deleteItem?.name}&quot;?
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
