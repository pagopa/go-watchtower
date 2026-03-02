'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Loader2, Server, Minus } from 'lucide-react'
import { toast } from 'sonner'
import { api, type Environment } from '@/lib/api-client'
import { usePermissions } from '@/hooks/use-permissions'
import { useSortable } from '@/hooks/use-sortable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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

const environmentSchema = z.object({
  name: z.string().min(1, 'Il nome è obbligatorio'),
  description: z.string().optional(),
  order: z.coerce.number().min(0, "L'ordine deve essere >= 0").optional(),
})

type EnvironmentFormData = z.infer<typeof environmentSchema>

interface EnvironmentsTabProps {
  productId: string
}

export function EnvironmentsTab({ productId }: EnvironmentsTabProps) {
  const queryClient = useQueryClient()
  const { can, isLoading: permissionsLoading } = usePermissions()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editItem, setEditItem] = useState<Environment | null>(null)
  const [deleteItem, setDeleteItem] = useState<Environment | null>(null)

  const canWrite = !permissionsLoading && can('ENVIRONMENT', 'write')
  const canDelete = !permissionsLoading && can('ENVIRONMENT', 'delete')

  const {
    data: environments,
    isLoading,
    error,
  } = useQuery<Environment[]>({
    queryKey: ['products', productId, 'environments'],
    queryFn: () => api.getEnvironments(productId),
  })

  type EnvSortKey = 'name' | 'order'
  const { sortedData: sortedEnvironments, sortConfig, requestSort } = useSortable<Environment, EnvSortKey>(environments, 'order')

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EnvironmentFormData>({
    resolver: zodResolver(environmentSchema) as Resolver<EnvironmentFormData>,
    defaultValues: { name: '', description: '', order: 0 },
  })

  const handleEdit = (item: Environment) => {
    reset({
      name: item.name,
      description: item.description || '',
      order: item.order,
    })
    setEditItem(item)
  }

  const createMutation = useMutation({
    mutationFn: (data: EnvironmentFormData) => api.createEnvironment(productId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', productId, 'environments'] })
      toast.success('Ambiente creato con successo')
      setShowCreateDialog(false)
      reset()
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante la creazione')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EnvironmentFormData }) =>
      api.updateEnvironment(productId, id, {
        name: data.name,
        description: data.description,
        order: data.order,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', productId, 'environments'] })
      toast.success('Ambiente aggiornato con successo')
      setEditItem(null)
      reset()
    },
    onError: (error: Error) => {
      toast.error(error.message || "Errore durante l'aggiornamento")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteEnvironment(productId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', productId, 'environments'] })
      toast.success('Ambiente eliminato con successo')
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
      reset({ name: '', description: '', order: 0 })
    }
  }

  const onSubmit = (data: EnvironmentFormData) => {
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
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-6 w-6 rounded shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2 opacity-60" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <p className="py-4 text-sm text-destructive">
        Errore durante il caricamento degli ambienti.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground">{environments?.length ?? 0}</span>
          {' '}ambienti
        </span>
        {canWrite && (
          <Button
            size="sm"
            onClick={() => {
              reset({ name: '', description: '', order: 0 })
              setShowCreateDialog(true)
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Nuovo Ambiente
          </Button>
        )}
      </div>

      {/* Table */}
      {sortedEnvironments && sortedEnvironments.length > 0 ? (
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
                {(canWrite || canDelete) && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedEnvironments.map((env) => (
                <TableRow key={env.id} className="group hover:bg-muted/30">
                  <TableCell className="text-center">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-muted text-xs font-medium tabular-nums text-muted-foreground">
                      {env.order}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{env.name}</div>
                    {env.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{env.description}</p>
                    )}
                  </TableCell>
                  {(canWrite || canDelete) && (
                    <TableCell>
                      <div className="flex gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleEdit(env)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setDeleteItem(env)}
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
            <Server className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Nessun ambiente configurato</p>
          <p className="mt-1.5 text-sm text-muted-foreground">Aggiungi un ambiente per iniziare.</p>
          {canWrite && (
            <Button
              size="sm"
              className="mt-5"
              onClick={() => {
                reset({ name: '', description: '', order: 0 })
                setShowCreateDialog(true)
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Nuovo Ambiente
            </Button>
          )}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted shrink-0">
                <Server className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <DialogTitle className="text-base">
                  {editItem ? 'Modifica Ambiente' : 'Nuovo Ambiente'}
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  {editItem
                    ? "Modifica i dettagli dell'ambiente."
                    : 'Aggiungi un nuovo ambiente al prodotto.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label htmlFor="env-name">Nome</Label>
              <Input
                id="env-name"
                placeholder="es. Produzione, Staging"
                {...register('name')}
                disabled={isMutating}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="env-order">Ordine</Label>
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
            <div className="space-y-2">
              <Label htmlFor="env-description">
                Descrizione
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(opzionale)</span>
              </Label>
              <Textarea
                id="env-description"
                placeholder="Descrizione dell'ambiente"
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
                {editItem ? 'Salva modifiche' : 'Crea ambiente'}
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
              Sei sicuro di voler eliminare l&apos;ambiente &quot;{deleteItem?.name}&quot;?
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
