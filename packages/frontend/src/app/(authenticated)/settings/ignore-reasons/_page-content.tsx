'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { IGNORE_REASON_CODE_REGEX } from '@go-watchtower/shared'
import {
  Plus, Pencil, Trash2, Loader2, Code2, AlertTriangle,
  ChevronDown, ChevronRight, Eye, EyeOff, Info, BanIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
import { cn } from '@/lib/utils'
import {
  api,
  type IgnoreReason,
  type IgnoreReasonDetailsSchema,
  type CreateIgnoreReasonData,
  type UpdateIgnoreReasonData,
} from '@/lib/api-client'
import { DynamicIgnoreDetailsForm } from '@/components/ui/json-schema-form'

// ─── Zod schema ───────────────────────────────────────────────────────────────

const reasonFormSchema = z.object({
  code:          z.string().min(1).regex(IGNORE_REASON_CODE_REGEX, 'Solo lettere maiuscole e underscore').optional(),
  label:         z.string().min(1, 'Label obbligatoria'),
  description:   z.string().optional(),
  sortOrder:     z.coerce.number().int().min(0).default(0),
  detailsSchema: z.string().optional(),
})

type ReasonFormData = z.infer<typeof reasonFormSchema>

// ─── Schema preview (inline in table row) ────────────────────────────────────

function SchemaPreview({ schema }: { schema: IgnoreReasonDetailsSchema | null }) {
  const [open, setOpen] = useState(false)
  if (!schema?.properties) {
    return <span className="text-xs text-muted-foreground/50 italic">—</span>
  }
  const fields = Object.entries(schema.properties)
  const required = schema.required ?? []
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Code2 className="h-3 w-3" />
        <span>{fields.length} {fields.length === 1 ? 'campo' : 'campi'}</span>
      </button>
      {open && (
        <div className="ml-4 space-y-0.5">
          {fields.map(([key, def]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs">
              <span className="font-mono text-[10px] rounded bg-muted px-1 py-0.5 text-foreground/60">
                {key}
              </span>
              <span className="text-muted-foreground">{def.title}</span>
              {required.includes(key) && (
                <span className="text-[9px] uppercase tracking-wide font-bold text-destructive/60">req</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Schema editor (in dialog) ────────────────────────────────────────────────

const SCHEMA_PLACEHOLDER = JSON.stringify(
  {
    type: 'object',
    properties: {
      version: {
        type: 'string',
        title: 'Versione',
        description: 'Versione del software (es. 1.4.2)',
        minLength: 1,
      },
    },
    required: ['version'],
  },
  null,
  2
)

function SchemaEditor({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  const [preview, setPreview] = useState(false)
  let parsed: IgnoreReasonDetailsSchema | null = null
  let parseError = ''
  if (value.trim()) {
    try {
      parsed = JSON.parse(value) as IgnoreReasonDetailsSchema
    } catch {
      parseError = 'JSON non valido'
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <Code2 className="h-3.5 w-3.5" />
          Schema dettagli
          <span className="text-muted-foreground/60 font-normal">(opzionale)</span>
        </Label>
        {value.trim() && !parseError && parsed?.properties && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={() => setPreview((v) => !v)}
          >
            {preview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {preview ? 'Nascondi anteprima' : 'Anteprima form'}
          </Button>
        )}
      </div>

      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={SCHEMA_PLACEHOLDER}
        rows={10}
        className="font-mono text-xs"
        spellCheck={false}
      />

      {(error || parseError) && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error || parseError}
        </p>
      )}

      <div className="flex items-start gap-1.5 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <div>
          <span className="font-medium">Tipi supportati:</span>{' '}
          <span className="font-mono">string</span>,{' '}
          <span className="font-mono">number</span>.{' '}
          Usa <span className="font-mono">&quot;x-ui&quot;: &quot;textarea&quot;</span> per campi multi-riga.
        </div>
      </div>

      {preview && parsed?.properties && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Anteprima form</p>
          <DynamicIgnoreDetailsForm
            control={{} as never}
            schema={parsed}
            disabled
          />
        </div>
      )}
    </div>
  )
}

// ─── Create/Edit dialog ───────────────────────────────────────────────────────

function ReasonDialog({
  open,
  onOpenChange,
  editItem,
  onSave,
  isPending,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editItem: IgnoreReason | null
  onSave: (data: CreateIgnoreReasonData | UpdateIgnoreReasonData, code?: string) => void
  isPending: boolean
}) {
  const isEdit = !!editItem

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ReasonFormData>({
    resolver: zodResolver(reasonFormSchema) as Resolver<ReasonFormData>,
    defaultValues: { code: '', label: '', description: '', sortOrder: 0, detailsSchema: '' },
  })

  useEffect(() => {
    if (open) {
      reset({
        code:          editItem?.code ?? '',
        label:         editItem?.label ?? '',
        description:   editItem?.description ?? '',
        sortOrder:     editItem?.sortOrder ?? 0,
        detailsSchema: editItem?.detailsSchema
          ? JSON.stringify(editItem.detailsSchema, null, 2)
          : '',
      })
    }
  }, [open, editItem, reset])

  const schemaText = watch('detailsSchema') ?? ''

  const handleSave = (data: ReasonFormData) => {
    let detailsSchema: IgnoreReasonDetailsSchema | null = null
    if (data.detailsSchema?.trim()) {
      try {
        detailsSchema = JSON.parse(data.detailsSchema) as IgnoreReasonDetailsSchema
      } catch {
        return
      }
    }
    if (isEdit) {
      onSave(
        { label: data.label, description: data.description || null, sortOrder: data.sortOrder, detailsSchema },
        editItem!.code
      )
    } else {
      onSave({ code: data.code!, label: data.label, description: data.description || null, sortOrder: data.sortOrder, detailsSchema })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Modifica motivo' : 'Nuovo motivo di esclusione'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Modifica label, descrizione, ordine e schema dei campi aggiuntivi.'
              : 'Definisci il codice identificativo, la label e i campi aggiuntivi richiesti.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleSave)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {!isEdit && (
              <div className="space-y-1.5">
                <Label htmlFor="ir-code">
                  Codice *
                  <span className="ml-1.5 text-[10px] font-normal text-muted-foreground/60 uppercase tracking-wide">MAIUSCOLO_UNDERSCORE</span>
                </Label>
                <Input
                  id="ir-code"
                  placeholder="es. PLANNED_DOWNTIME"
                  {...register('code')}
                  className="font-mono uppercase"
                  onChange={(e) => {
                    const v = e.target.value.toUpperCase().replace(/[^A-Z_]/g, '')
                    setValue('code', v)
                  }}
                />
                {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
              </div>
            )}

            <div className={cn('space-y-1.5', !isEdit ? '' : 'sm:col-span-2')}>
              <Label htmlFor="ir-label">Label *</Label>
              <Input id="ir-label" placeholder="es. Downtime pianificato" {...register('label')} />
              {errors.label && <p className="text-xs text-destructive">{errors.label.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ir-sort">Ordine visualizzazione</Label>
              <Input id="ir-sort" type="number" min={0} {...register('sortOrder')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ir-desc">Descrizione</Label>
            <Textarea id="ir-desc" rows={2} placeholder="Breve descrizione del motivo..." {...register('description')} />
          </div>

          <SchemaEditor
            value={schemaText}
            onChange={(v) => setValue('detailsSchema', v)}
            error={errors.detailsSchema?.message}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Annulla
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Salva modifiche' : 'Crea motivo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function IgnoreReasonsPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<IgnoreReason | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<IgnoreReason | null>(null)

  const { data: reasons, isLoading } = useQuery({
    queryKey: ['ignore-reasons'],
    queryFn: () => api.getIgnoreReasons(),
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateIgnoreReasonData) => api.createIgnoreReason(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ignore-reasons'] })
      setDialogOpen(false)
      toast.success('Motivo creato con successo')
    },
    onError: (err: Error) => toast.error(err.message || 'Errore durante la creazione'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ code, data }: { code: string; data: UpdateIgnoreReasonData }) =>
      api.updateIgnoreReason(code, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ignore-reasons'] })
      setDialogOpen(false)
      setEditItem(null)
      toast.success('Motivo aggiornato')
    },
    onError: (err: Error) => toast.error(err.message || 'Errore durante il salvataggio'),
  })

  const deleteMutation = useMutation({
    mutationFn: (code: string) => api.deleteIgnoreReason(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ignore-reasons'] })
      setDeleteTarget(null)
      toast.success('Motivo eliminato')
    },
    onError: (err: Error) => toast.error(err.message || 'Impossibile eliminare: il motivo è in uso'),
  })

  const handleSave = (
    data: CreateIgnoreReasonData | UpdateIgnoreReasonData,
    code?: string
  ) => {
    if (code) {
      updateMutation.mutate({ code, data: data as UpdateIgnoreReasonData })
    } else {
      createMutation.mutate(data as CreateIgnoreReasonData)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BanIcon className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">Motivi di esclusione</h1>
          </div>
          <div className="text-sm text-muted-foreground">
            Codici disponibili per le analisi di tipo{' '}
            <Badge variant="secondary" className="text-[11px] font-mono">IGNORABLE</Badge>.
            {' '}Ogni motivo può definire uno schema JSON per raccogliere dettagli specifici.
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
          Nuovo motivo
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Codice</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Ordine</TableHead>
                <TableHead>Campi extra</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(3)].map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : !reasons?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <BanIcon className="mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Nessun motivo configurato</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Crea il primo motivo di esclusione.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-44 text-xs">Codice</TableHead>
                <TableHead className="text-xs">Label / Descrizione</TableHead>
                <TableHead className="w-20 text-xs text-center">Ordine</TableHead>
                <TableHead className="text-xs">Campi extra</TableHead>
                <TableHead className="w-20 text-xs" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {reasons.map((reason) => (
                <TableRow key={reason.code} className="group">
                  <TableCell className="py-3">
                    <span className="font-mono text-xs rounded border bg-muted px-2 py-0.5 font-semibold tracking-wider text-foreground/70">
                      {reason.code}
                    </span>
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="font-medium text-sm">{reason.label}</div>
                    {reason.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">{reason.description}</div>
                    )}
                  </TableCell>
                  <TableCell className="py-3 text-center text-sm text-muted-foreground">
                    {reason.sortOrder}
                  </TableCell>
                  <TableCell className="py-3">
                    <SchemaPreview schema={reason.detailsSchema} />
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditItem(reason)
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
                        onClick={() => setDeleteTarget(reason)}
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
      <ReasonDialog
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
        description={`Stai per eliminare ${deleteTarget?.label} (${deleteTarget?.code}). L'operazione fallirà se il motivo è già usato in qualche analisi.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.code)}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}
