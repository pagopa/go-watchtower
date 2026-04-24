'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Loader2, Flag, BellRing, PhoneCall } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { api, type AlertPriorityLevel, type CreatePriorityLevelData, type UpdatePriorityLevelData } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { usePermissions } from '@/hooks/use-permissions'

const priorityLevelFormSchema = z.object({
  code: z.string().min(2, 'Codice obbligatorio').regex(/^[A-Z][A-Z0-9_]*$/, 'Usa solo maiuscole, numeri e underscore'),
  label: z.string().min(1, 'Label obbligatoria'),
  description: z.string().optional(),
  rank: z.coerce.number().int(),
  color: z.string().optional(),
  icon: z.string().optional(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  countsAsOnCall: z.boolean(),
  defaultNotify: z.boolean(),
})

type PriorityLevelFormData = z.infer<typeof priorityLevelFormSchema>

function PriorityFlagList({ level }: { level: AlertPriorityLevel }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {level.isDefault && <Badge variant="secondary">Default</Badge>}
      {level.countsAsOnCall && (
        <Badge variant="outline" className="gap-1">
          <PhoneCall className="h-3 w-3" />
          On-call
        </Badge>
      )}
      {level.defaultNotify && (
        <Badge variant="outline" className="gap-1">
          <BellRing className="h-3 w-3" />
          Notifiche default
        </Badge>
      )}
      {level.isSystem && <Badge variant="outline">Sistema</Badge>}
    </div>
  )
}

function PriorityLevelDialog({
  open,
  onOpenChange,
  editItem,
  onSave,
  isPending,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  editItem: AlertPriorityLevel | null
  onSave: (data: CreatePriorityLevelData | UpdatePriorityLevelData, code?: string) => void
  isPending: boolean
}) {
  const isEdit = !!editItem

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isDirty },
  } = useForm<PriorityLevelFormData>({
    resolver: zodResolver(priorityLevelFormSchema) as Resolver<PriorityLevelFormData>,
    defaultValues: {
      code: '',
      label: '',
      description: '',
      rank: 0,
      color: '',
      icon: '',
      isActive: true,
      isDefault: false,
      countsAsOnCall: false,
      defaultNotify: false,
    },
  })

  useEffect(() => {
    if (!open) return
    reset({
      code: editItem?.code ?? '',
      label: editItem?.label ?? '',
      description: editItem?.description ?? '',
      rank: editItem?.rank ?? 0,
      color: editItem?.color ?? '',
      icon: editItem?.icon ?? '',
      isActive: editItem?.isActive ?? true,
      isDefault: editItem?.isDefault ?? false,
      countsAsOnCall: editItem?.countsAsOnCall ?? false,
      defaultNotify: editItem?.defaultNotify ?? false,
    })
  }, [editItem, open, reset])

  const handleSave = (data: PriorityLevelFormData) => {
    const payload = {
      label: data.label,
      description: data.description?.trim() ? data.description.trim() : null,
      rank: data.rank,
      color: data.color?.trim() ? data.color.trim() : null,
      icon: data.icon?.trim() ? data.icon.trim() : null,
      isActive: data.isActive,
      isDefault: data.isDefault,
      countsAsOnCall: data.countsAsOnCall,
      defaultNotify: data.defaultNotify,
    }

    if (isEdit) {
      onSave(payload satisfies UpdatePriorityLevelData, editItem!.code)
      return
    }

    onSave({ code: data.code, ...payload } satisfies CreatePriorityLevelData)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" isDirty={isDirty} onDirtyClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Modifica priority' : 'Nuovo livello priority'}</DialogTitle>
          <DialogDescription>
            Definisci semantica, ordinamento e comportamento operativo del livello.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleSave)} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="priority-code">Codice *</Label>
              <Input
                id="priority-code"
                placeholder="es. BUSINESS_CRITICAL"
                {...register('code')}
                disabled={isEdit}
                className={isEdit ? 'font-mono text-muted-foreground' : 'font-mono'}
              />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="priority-label">Label *</Label>
              <Input id="priority-label" placeholder="es. Business Critical" {...register('label')} />
              {errors.label && <p className="text-xs text-destructive">{errors.label.message}</p>}
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="priority-description">Descrizione</Label>
              <Textarea
                id="priority-description"
                rows={3}
                placeholder="Descrivi quando usare questa priority e il suo significato operativo"
                {...register('description')}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="priority-rank">Rank</Label>
              <Input id="priority-rank" type="number" {...register('rank')} />
              <p className="text-xs text-muted-foreground">Valori più alti vincono a parità di matcher.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="priority-color">Color token</Label>
              <Input id="priority-color" placeholder="es. red, amber, sky" {...register('color')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="priority-icon">Icon token</Label>
              <Input id="priority-icon" placeholder="es. flame, bell, phone" {...register('icon')} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <SwitchField control={control} name="isActive" label="Livello attivo" description="Disponibile nelle regole e nei filtri." />
            <SwitchField control={control} name="isDefault" label="Default" description="Usato quando nessuna regola matcha." />
            <SwitchField control={control} name="countsAsOnCall" label="Conta come on-call" description="Influenza report e classificazioni on-call." />
            <SwitchField control={control} name="defaultNotify" label="Notifica di default" description="Abilitato di default nelle preferenze utente." />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Annulla
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Salva modifiche' : 'Crea livello'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SwitchField({
  control,
  name,
  label,
  description,
}: {
  control: ReturnType<typeof useForm<PriorityLevelFormData>>['control']
  name: keyof Pick<PriorityLevelFormData, 'isActive' | 'isDefault' | 'countsAsOnCall' | 'defaultNotify'>
  label: string
  description: string
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
          <div className="min-w-0 pr-4">
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <Switch checked={field.value} onCheckedChange={field.onChange} />
        </div>
      )}
    />
  )
}

export function PriorityLevelsPage() {
  const queryClient = useQueryClient()
  const { can, isLoading: permissionsLoading } = usePermissions()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<AlertPriorityLevel | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AlertPriorityLevel | null>(null)

  const canWrite = !permissionsLoading && can('PRIORITY_LEVEL', 'write')
  const canDelete = !permissionsLoading && can('PRIORITY_LEVEL', 'delete')

  const { data: priorityLevels, isLoading, refetch, error } = useQuery({
    queryKey: qk.priorityLevels.list,
    queryFn: api.getPriorityLevels,
  })

  const invalidateRelatedQueries = () => {
    queryClient.invalidateQueries({ queryKey: qk.priorityLevels.root })
    queryClient.invalidateQueries({ queryKey: qk.alarmEvents.root })
    queryClient.invalidateQueries({ queryKey: qk.analyses.root })
    queryClient.invalidateQueries({ queryKey: qk.products.root })
  }

  const createMutation = useMutation({
    mutationFn: (data: CreatePriorityLevelData) => api.createPriorityLevel(data),
    onSuccess: () => {
      invalidateRelatedQueries()
      setDialogOpen(false)
      toast.success('Livello priority creato')
    },
    onError: (error: Error) => toast.error(error.message || 'Errore durante la creazione'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ code, data }: { code: string; data: UpdatePriorityLevelData }) => api.updatePriorityLevel(code, data),
    onSuccess: () => {
      invalidateRelatedQueries()
      setDialogOpen(false)
      setEditItem(null)
      toast.success('Livello priority aggiornato')
    },
    onError: (error: Error) => toast.error(error.message || 'Errore durante il salvataggio'),
  })

  const deleteMutation = useMutation({
    mutationFn: (code: string) => api.deletePriorityLevel(code),
    onSuccess: () => {
      invalidateRelatedQueries()
      setDeleteTarget(null)
      toast.success('Livello priority eliminato')
    },
    onError: (error: Error) => toast.error(error.message || 'Impossibile eliminare il livello'),
  })

  const handleSave = (data: CreatePriorityLevelData | UpdatePriorityLevelData, code?: string) => {
    if (code) {
      updateMutation.mutate({ code, data: data as UpdatePriorityLevelData })
      return
    }
    createMutation.mutate(data as CreatePriorityLevelData)
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">Priority allarmi</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Catalogo centralizzato dei livelli di priority usati dalle regole di classificazione degli allarmi.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => { setEditItem(null); setDialogOpen(true) }} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" />
            Nuovo livello
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
        Le modifiche ai livelli impattano etichette, notifiche e aggregazioni on-call. Gli eventi storici mantengono la priority materializzata finché non vengono riclassificati.
      </div>

      {isLoading ? (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Livello</TableHead>
                <TableHead className="w-24">Rank</TableHead>
                <TableHead>Flag</TableHead>
                <TableHead className="w-24">Stato</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 4 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-56" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : error ? (
        <div className="rounded-xl border p-8 text-center space-y-3">
          <p className="text-sm text-destructive">Errore durante il caricamento dei livelli priority.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Riprova
          </Button>
        </div>
      ) : !priorityLevels?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <Flag className="mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Nessun livello configurato</p>
          <p className="mt-1 text-xs text-muted-foreground/60">Crea il primo livello priority.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Livello</TableHead>
                <TableHead className="w-20 text-center">Rank</TableHead>
                <TableHead>Flag</TableHead>
                <TableHead className="w-24 text-center">Stato</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {priorityLevels.map((level) => (
                <TableRow key={level.code} className="group">
                  <TableCell className="py-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{level.label}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {level.code}
                        </span>
                      </div>
                      {level.description && (
                        <p className="max-w-2xl text-xs text-muted-foreground">{level.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm">{level.rank}</TableCell>
                  <TableCell>
                    <PriorityFlagList level={level} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={level.isActive ? 'secondary' : 'outline'}>
                      {level.isActive ? 'Attiva' : 'Inattiva'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {canWrite && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditItem(level)
                            setDialogOpen(true)
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && !level.isSystem && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setDeleteTarget(level)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PriorityLevelDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditItem(null)
        }}
        editItem={editItem}
        onSave={handleSave}
        isPending={isPending}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        description={`Stai per eliminare il livello "${deleteTarget?.label}". L'operazione è consentita solo se non esistono regole o eventi che lo referenziano.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.code)}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}
