'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, SlidersHorizontal, Check, X, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { api, type SystemSetting } from '@/lib/api-client'
import { usePermissions } from '@/hooks/use-permissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Type-aware inline editor ─────────────────────────────────────────────────

function SettingValueEditor({
  setting,
  onSave,
  onCancel,
  isPending,
}: {
  setting: SystemSetting
  onSave: (value: unknown) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [draft, setDraft] = useState<unknown>(setting.value)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSave(draft)
    if (e.key === 'Escape') onCancel()
  }

  if (setting.type === 'BOOLEAN') {
    return (
      <div className="flex items-center gap-2">
        <Switch
          checked={!!draft}
          onCheckedChange={(v) => setDraft(v)}
          disabled={isPending}
        />
        <span className="text-xs text-muted-foreground">{draft ? 'Attivo' : 'Inattivo'}</span>
        <div className="ml-2 flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50"
            onClick={() => onSave(draft)}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={onCancel}
            disabled={isPending}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type={setting.type === 'NUMBER' ? 'number' : 'text'}
        value={String(draft ?? '')}
        onChange={(e) =>
          setDraft(setting.type === 'NUMBER' ? Number(e.target.value) : e.target.value)
        }
        onKeyDown={handleKeyDown}
        className="h-7 w-48 text-sm"
        autoFocus
        disabled={isPending}
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50"
        onClick={() => onSave(draft)}
        disabled={isPending}
      >
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 text-muted-foreground hover:text-foreground"
        onClick={onCancel}
        disabled={isPending}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}

// ─── Value display ─────────────────────────────────────────────────────────────

function SettingValueDisplay({ setting }: { setting: SystemSetting }) {
  if (setting.type === 'BOOLEAN') {
    return (
      <Badge variant={setting.value ? 'default' : 'secondary'} className="text-xs">
        {setting.value ? 'Attivo' : 'Inattivo'}
      </Badge>
    )
  }
  return (
    <span className="font-mono text-sm">{String(setting.value ?? '')}</span>
  )
}

// ─── Type badge ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: SystemSetting['type'] }) {
  const colors = {
    STRING:  'bg-blue-50 text-blue-700 border-blue-200',
    NUMBER:  'bg-amber-50 text-amber-700 border-amber-200',
    BOOLEAN: 'bg-purple-50 text-purple-700 border-purple-200',
    JSON:    'bg-green-50 text-green-700 border-green-200',
  } as const
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wide ${colors[type]}`}
    >
      {type}
    </span>
  )
}

// ─── Group rows ────────────────────────────────────────────────────────────────

function SettingRow({
  setting,
  canWrite,
}: {
  setting: SystemSetting
  canWrite: boolean
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)

  const mutation = useMutation({
    mutationFn: (value: unknown) => api.updateSetting(setting.key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setEditing(false)
      toast.success(`Parametro aggiornato`)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Errore durante il salvataggio')
    },
  })

  return (
    <TableRow className="group">
      <TableCell className="font-mono text-xs text-muted-foreground py-3">
        {setting.key}
      </TableCell>
      <TableCell className="py-3">
        <div className="font-medium text-sm">{setting.label}</div>
        {setting.description && (
          <div className="text-xs text-muted-foreground mt-0.5">{setting.description}</div>
        )}
      </TableCell>
      <TableCell className="py-3">
        <TypeBadge type={setting.type} />
      </TableCell>
      <TableCell className="py-3">
        {editing ? (
          <SettingValueEditor
            setting={setting}
            onSave={(v) => mutation.mutate(v)}
            onCancel={() => setEditing(false)}
            isPending={mutation.isPending}
          />
        ) : (
          <div className="flex items-center gap-2">
            <SettingValueDisplay setting={setting} />
            {canWrite && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => setEditing(true)}
                title="Modifica"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function SystemParametersPage() {
  const { can, isLoading: permissionsLoading } = usePermissions()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  })

  const canWrite = !permissionsLoading && can('SYSTEM_SETTING', 'write')

  // Group settings by category
  const grouped = settings?.reduce<Record<string, SystemSetting[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category]!.push(s)
    return acc
  }, {}) ?? {}

  const categories = Object.keys(grouped).sort()

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight">Parametri di sistema</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Visualizza e modifica i parametri di configurazione del sistema. Clicca sul valore per modificarlo.
        </p>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-40 w-full" />
            </div>
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <SlidersHorizontal className="mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Nessun parametro configurato</p>
        </div>
      ) : (
        <div className="space-y-8">
          {categories.map((category) => (
            <div key={category} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 px-1">
                {category}
              </h2>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="w-48 text-xs">Chiave</TableHead>
                      <TableHead className="text-xs">Parametro</TableHead>
                      <TableHead className="w-24 text-xs">Tipo</TableHead>
                      <TableHead className="w-64 text-xs">Valore</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grouped[category]!.map((setting) => (
                      <SettingRow
                        key={setting.key}
                        setting={setting}
                        canWrite={canWrite}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
