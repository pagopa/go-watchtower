'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Loader2, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  api,
  type ResourceType,
  type CreateResourceTypeData,
  type UpdateResourceTypeData,
} from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { invalidate } from '@/lib/query-invalidation'

// ─── Zod schema ───────────────────────────────────────────────────────────────

const resourceTypeFormSchema = z.object({
  name:      z.string().min(1, 'Nome obbligatorio'),
  sortOrder: z.coerce.number().int().min(0).default(0),
})

type ResourceTypeFormData = z.infer<typeof resourceTypeFormSchema>

// ─── Create/Edit dialog ───────────────────────────────────────────────────────

function ResourceTypeDialog({
  open,
  onOpenChange,
  editItem,
  onSave,
  isPending,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editItem: ResourceType | null
  onSave: (data: CreateResourceTypeData | UpdateResourceTypeData, id?: string) => void
  isPending: boolean
}) {
  const isEdit = !!editItem

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ResourceTypeFormData>({
    resolver: zodResolver(resourceTypeFormSchema) as Resolver<ResourceTypeFormData>,
    defaultValues: { name: '', sortOrder: 0 },
  })

  useEffect(() => {
    if (open) {
      reset({
        name:      editItem?.name ?? '',
        sortOrder: editItem?.sortOrder ?? 0,
      })
    }
  }, [open, editItem, reset])

  const handleSave = (data: ResourceTypeFormData) => {
    if (isEdit) {
      onSave({ name: data.name, sortOrder: data.sortOrder }, editItem!.id)
    } else {
      onSave({ name: data.name, sortOrder: data.sortOrder })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" isDirty={isDirty} onDirtyClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Modifica tipo risorsa' : 'Nuovo tipo risorsa'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Modifica il nome e l\'ordine del tipo risorsa.'
              : 'Definisci il nome e l\'ordine di visualizzazione.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rt-name">Nome *</Label>
              <Input id="rt-name" placeholder="es. Service, Lambda" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rt-sort">Ordine visualizzazione</Label>
              <Input id="rt-sort" type="number" min={0} {...register('sortOrder')} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Annulla
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Salva modifiche' : 'Crea tipo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ResourceTypesPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<ResourceType | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ResourceType | null>(null)

  const { data: resourceTypes, isLoading } = useQuery({
    queryKey: qk.resourceTypes.list,
    queryFn: () => api.getResourceTypes(),
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateResourceTypeData) => api.createResourceType(data),
    onSuccess: () => {
      invalidate(queryClient, 'resourceTypes')
      setDialogOpen(false)
      toast.success('Tipo risorsa creato con successo')
    },
    onError: (err: Error) => toast.error(err.message || 'Errore durante la creazione'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateResourceTypeData }) =>
      api.updateResourceType(id, data),
    onSuccess: () => {
      invalidate(queryClient, 'resourceTypes')
      setDialogOpen(false)
      setEditItem(null)
      toast.success('Tipo risorsa aggiornato')
    },
    onError: (err: Error) => toast.error(err.message || 'Errore durante il salvataggio'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteResourceType(id),
    onSuccess: () => {
      invalidate(queryClient, 'resourceTypes')
      setDeleteTarget(null)
      toast.success('Tipo risorsa eliminato')
    },
    onError: (err: Error) => toast.error(err.message || 'Impossibile eliminare: il tipo è in uso'),
  })

  const handleSave = (
    data: CreateResourceTypeData | UpdateResourceTypeData,
    id?: string
  ) => {
    if (id) {
      updateMutation.mutate({ id, data: data as UpdateResourceTypeData })
    } else {
      createMutation.mutate(data as CreateResourceTypeData)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">Tipi risorsa</h1>
          </div>
          <div className="text-sm text-muted-foreground">
            Categorie utilizzate per classificare le risorse dei prodotti (es. Service, Lambda, Cronjob).
          </div>
        </div>
        <Button
          onClick={() => {
            setEditItem(null)
            setDialogOpen(true)
          }}
          className="shrink-0"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nuovo tipo
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Nome</TableHead>
                <TableHead className="w-20">Ordine</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }, (_, n) => n).map(n => (
                <TableRow key={n}>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : !resourceTypes?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <Layers className="mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Nessun tipo configurato</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Crea il primo tipo di risorsa.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs">Nome</TableHead>
                <TableHead className="w-20 text-xs text-center">Ordine</TableHead>
                <TableHead className="w-20 text-xs" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {resourceTypes.map((rt) => (
                <TableRow key={rt.id} className="group">
                  <TableCell className="py-3">
                    <span className="font-medium text-sm">{rt.name}</span>
                  </TableCell>
                  <TableCell className="py-3 text-center text-sm text-muted-foreground">
                    {rt.sortOrder}
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditItem(rt)
                          setDialogOpen(true)
                        }}
                        title="Modifica"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget(rt)}
                        title="Elimina"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit dialog */}
      <ResourceTypeDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v)
          if (!v) setEditItem(null)
        }}
        editItem={editItem}
        onSave={handleSave}
        isPending={isPending}
      />

      {/* Delete confirmation */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        description={`Stai per eliminare il tipo "${deleteTarget?.name}". L'operazione fallirà se il tipo è in uso da qualche risorsa.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}
