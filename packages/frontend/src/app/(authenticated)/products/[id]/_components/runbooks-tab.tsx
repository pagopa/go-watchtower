'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Loader2, ExternalLink, BookOpen, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { RunbookStatuses, RUNBOOK_STATUS_LABELS } from '@go-watchtower/shared'
import { api, type Runbook } from '@/lib/api-client'
import { usePermissions } from '@/hooks/use-permissions'
import { useSortable } from '@/hooks/use-sortable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
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

const runbookSchema = z.object({
  name: z.string().min(1, 'Il nome è obbligatorio'),
  description: z.string().optional(),
  link: z.string().url('Inserisci un URL valido'),
  status: z.enum([RunbookStatuses.DRAFT, RunbookStatuses.COMPLETE]),
})

type RunbookFormData = z.infer<typeof runbookSchema>

function getUrlHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.slice(0, 30)
  }
}

interface RunbooksTabProps {
  productId: string
}

export function RunbooksTab({ productId }: RunbooksTabProps) {
  const queryClient = useQueryClient()
  const { can, isLoading: permissionsLoading } = usePermissions()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editItem, setEditItem] = useState<Runbook | null>(null)
  const [deleteItem, setDeleteItem] = useState<Runbook | null>(null)

  const canWrite = !permissionsLoading && can('RUNBOOK', 'write')
  const canDelete = !permissionsLoading && can('RUNBOOK', 'delete')

  const {
    data: runbooks,
    isLoading,
    error,
  } = useQuery<Runbook[]>({
    queryKey: ['products', productId, 'runbooks'],
    queryFn: () => api.getRunbooks(productId),
  })

  type RbSortKey = 'name'
  const { sortedData: sortedRunbooks, sortConfig, requestSort } = useSortable<Runbook, RbSortKey>(runbooks, 'name')

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RunbookFormData>({
    resolver: zodResolver(runbookSchema),
    defaultValues: { name: '', description: '', link: '', status: RunbookStatuses.DRAFT },
  })

  const handleEdit = (item: Runbook) => {
    reset({
      name: item.name,
      description: item.description || '',
      link: item.link,
      status: item.status,
    })
    setEditItem(item)
  }

  const createMutation = useMutation({
    mutationFn: (data: RunbookFormData) => api.createRunbook(productId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', productId, 'runbooks'] })
      toast.success('Runbook creato con successo')
      setShowCreateDialog(false)
      reset()
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante la creazione')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: RunbookFormData }) =>
      api.updateRunbook(productId, id, {
        name: data.name,
        description: data.description,
        link: data.link,
        status: data.status,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', productId, 'runbooks'] })
      toast.success('Runbook aggiornato con successo')
      setEditItem(null)
      reset()
    },
    onError: (error: Error) => {
      toast.error(error.message || "Errore durante l'aggiornamento")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteRunbook(productId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', productId, 'runbooks'] })
      toast.success('Runbook eliminato con successo')
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
      reset({ name: '', description: '', link: '', status: RunbookStatuses.DRAFT })
    }
  }

  const onSubmit = (data: RunbookFormData) => {
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
          {[0, 1, 2].map((n) => (
            <div key={`skeleton-${n}`} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3 opacity-60" />
              </div>
              <Skeleton className="h-6 w-28 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <p className="py-4 text-sm text-destructive">
        Errore durante il caricamento dei runbook.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{runbooks?.length ?? 0}</span>
            {' '}runbook
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
              reset({ name: '', description: '', link: '', status: RunbookStatuses.DRAFT })
              setShowCreateDialog(true)
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Nuovo Runbook
          </Button>
        )}
      </div>

      {/* List */}
      {sortedRunbooks && sortedRunbooks.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
          {sortedRunbooks.map((rb) => (
            <li
              key={rb.id}
              className="group relative flex items-center gap-3 bg-card px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              <span
                className="pointer-events-none absolute inset-y-0 left-0 w-0.5 rounded-r-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{rb.name}</p>
                {rb.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">{rb.description}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={rb.status === RunbookStatuses.COMPLETE ? 'default' : 'secondary'} className="text-xs">
                  {RUNBOOK_STATUS_LABELS[rb.status]}
                </Badge>
                <a
                  href={rb.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" />
                  {getUrlHostname(rb.link)}
                </a>
                {(canWrite || canDelete) && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleEdit(rb)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setDeleteItem(rb)}
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
            <BookOpen className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Nessun runbook configurato</p>
          <p className="mt-1.5 text-sm text-muted-foreground">Aggiungi un runbook per iniziare.</p>
          {canWrite && (
            <Button
              size="sm"
              className="mt-5"
              onClick={() => {
                reset({ name: '', description: '', link: '', status: RunbookStatuses.DRAFT })
                setShowCreateDialog(true)
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Nuovo Runbook
            </Button>
          )}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted shrink-0">
                <BookOpen className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <DialogTitle className="text-base">
                  {editItem ? 'Modifica Runbook' : 'Nuovo Runbook'}
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  {editItem
                    ? 'Modifica i dettagli del runbook.'
                    : 'Aggiungi un nuovo runbook al prodotto.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
            <div className="space-y-2">
              <Label htmlFor="rb-name">Nome</Label>
              <Input
                id="rb-name"
                placeholder="es. Procedura di rollback"
                {...register('name')}
                disabled={isMutating}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="rb-link">
                Link
              </Label>
              <div className="relative">
                <ExternalLink className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="rb-link"
                  type="url"
                  placeholder="https://..."
                  className="pl-8"
                  {...register('link')}
                  disabled={isMutating}
                />
              </div>
              {errors.link && (
                <p className="text-xs text-destructive">{errors.link.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="rb-status">Stato</Label>
              <Select
                value={watch('status')}
                onValueChange={(v) => setValue('status', v as 'DRAFT' | 'COMPLETE')}
                disabled={isMutating}
              >
                <SelectTrigger id="rb-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={RunbookStatuses.DRAFT}>{RUNBOOK_STATUS_LABELS.DRAFT}</SelectItem>
                  <SelectItem value={RunbookStatuses.COMPLETE}>{RUNBOOK_STATUS_LABELS.COMPLETE}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rb-description">
                Descrizione
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(opzionale)</span>
              </Label>
              <Textarea
                id="rb-description"
                placeholder="Descrizione del runbook"
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
                {editItem ? 'Salva modifiche' : 'Crea runbook'}
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
              Sei sicuro di voler eliminare il runbook &quot;{deleteItem?.name}&quot;?
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
