'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Loader2, ArrowUp, ArrowDown, ArrowUpDown, Box } from 'lucide-react'
import { toast } from 'sonner'
import { usePermissions } from '@/hooks/use-permissions'
import { useSortable } from '@/hooks/use-sortable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  api,
  type ProductResource,
  type ResourceType,
} from '@/lib/api-client'
import { qk } from '@/lib/query-keys'

const SKELETON_ROWS = [0, 1, 2]

const resourceSchema = z.object({
  name: z.string().min(1, 'Il nome è obbligatorio'),
  description: z.string().optional(),
  typeId: z.string().min(1, 'Il tipo è obbligatorio'),
})

type ResourceFormData = z.infer<typeof resourceSchema>

interface ResourcesTabProps {
  productId: string
}

export function ResourcesTab({ productId }: ResourcesTabProps) {
  const queryClient = useQueryClient()
  const { can, isLoading: permissionsLoading } = usePermissions()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editItem, setEditItem] = useState<ProductResource | null>(null)
  const [deleteItem, setDeleteItem] = useState<ProductResource | null>(null)

  const canWrite = !permissionsLoading && can('RESOURCE', 'write')
  const canDelete = !permissionsLoading && can('RESOURCE', 'delete')

  const {
    data: items,
    isLoading,
    error,
    refetch,
  } = useQuery<ProductResource[]>({
    queryKey: qk.products.resources(productId),
    queryFn: () => api.getResources(productId),
  })

  const { data: resourceTypes } = useQuery<ResourceType[]>({
    queryKey: qk.resourceTypes.list,
    queryFn: () => api.getResourceTypes(),
  })

  type SortKey = 'name'
  const { sortedData: sortedItems, sortConfig, requestSort } = useSortable<ProductResource, SortKey>(items, 'name')

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<ResourceFormData>({
    resolver: zodResolver(resourceSchema),
    defaultValues: { name: '', description: '', typeId: '' },
  })

  const selectedTypeId = watch('typeId')

  const handleEdit = (item: ProductResource) => {
    reset({ name: item.name, description: item.description || '', typeId: item.typeId })
    setEditItem(item)
  }

  const createMutation = useMutation({
    mutationFn: (data: ResourceFormData) =>
      api.createResource(productId, { name: data.name, description: data.description, typeId: data.typeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.products.resources(productId) })
      toast.success('Risorsa creata con successo')
      setShowCreateDialog(false)
      reset()
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante la creazione')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ResourceFormData }) =>
      api.updateResource(productId, id, { name: data.name, description: data.description, typeId: data.typeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.products.resources(productId) })
      toast.success('Risorsa aggiornata con successo')
      setEditItem(null)
      reset()
    },
    onError: (error: Error) => {
      toast.error(error.message || "Errore durante l'aggiornamento")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteResource(productId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.products.resources(productId) })
      toast.success('Risorsa eliminata con successo')
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
      reset({ name: '', description: '', typeId: '' })
    }
  }

  const onSubmit = (data: ResourceFormData) => {
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  if (isLoading && !items) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-36 rounded-md" />
        </div>
        <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
          {SKELETON_ROWS.map((n) => (
            <div key={`skeleton-${n}`} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3 opacity-60" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-4 text-center space-y-2">
        <p className="text-sm text-destructive">Errore durante il caricamento delle risorse.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Riprova
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{items?.length ?? 0}</span>
            {' '}risorse
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
              reset({ name: '', description: '', typeId: '' })
              setShowCreateDialog(true)
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Nuova Risorsa
          </Button>
        )}
      </div>

      {/* List */}
      {sortedItems && sortedItems.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
          {sortedItems.map((item) => (
            <li
              key={item.id}
              className="group relative flex items-center gap-3 bg-card px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              <span
                className="pointer-events-none absolute inset-y-0 left-0 w-0.5 rounded-r-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <Badge variant="outline" className="text-[10px] shrink-0">{item.type.name}</Badge>
                </div>
                {item.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">{item.description}</p>
                )}
              </div>
              {(canWrite || canDelete) && (
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  {canWrite && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleEdit(item)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setDeleteItem(item)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
            <Box className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Nessuna risorsa configurata</p>
          <p className="mt-1.5 text-sm text-muted-foreground">Aggiungi una risorsa per iniziare.</p>
          {canWrite && (
            <Button
              size="sm"
              className="mt-5"
              onClick={() => {
                reset({ name: '', description: '', typeId: '' })
                setShowCreateDialog(true)
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Nuova Risorsa
            </Button>
          )}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={(v) => { if (!isDirty || v) handleDialogClose(v) }}>
        <DialogContent className="sm:max-w-md" isDirty={isDirty} onDirtyClose={() => handleDialogClose(false)}>
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted shrink-0">
                <Box className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <DialogTitle className="text-base">
                  {editItem ? 'Modifica Risorsa' : 'Nuova Risorsa'}
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  {editItem ? 'Modifica i dettagli della risorsa.' : 'Aggiungi una nuova risorsa al prodotto.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label htmlFor="resources-name">Nome</Label>
              <Input
                id="resources-name"
                placeholder="es. api-gateway, user-service"
                {...register('name')}
                disabled={isMutating}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="resources-type">Tipo *</Label>
              <Select
                value={selectedTypeId}
                onValueChange={(v) => setValue('typeId', v, { shouldValidate: true, shouldDirty: true })}
                disabled={isMutating}
              >
                <SelectTrigger id="resources-type">
                  <SelectValue placeholder="Seleziona un tipo" />
                </SelectTrigger>
                <SelectContent>
                  {resourceTypes?.map((rt) => (
                    <SelectItem key={rt.id} value={rt.id}>
                      {rt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.typeId && (
                <p className="text-xs text-destructive">{errors.typeId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="resources-description">
                Descrizione
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(opzionale)</span>
              </Label>
              <Textarea
                id="resources-description"
                placeholder="Descrizione opzionale della risorsa"
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
                {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editItem ? 'Salva modifiche' : 'Crea'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteItem}
        onOpenChange={() => setDeleteItem(null)}
        description={`Sei sicuro di voler eliminare la risorsa "${deleteItem?.name}"? Questa azione non può essere annullata.`}
        onConfirm={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}
