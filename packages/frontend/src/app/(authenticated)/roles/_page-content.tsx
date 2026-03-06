'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Shield,
  Plus,
  Trash2,
  Loader2,
  Save,
  Users,
  Star,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  api,
  type Role,
  type PermissionScope,
  type RolePermission,
  type CreateRoleData,
  type UpdateRoleData,
  type UpdateRolePermissionsData,
} from '@/lib/api-client'
import { usePermissions } from '@/hooks/use-permissions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog'
import { DISPLAY_RESOURCES, RESOURCE_LABELS, PERMISSION_SCOPE_LABELS } from '@go-watchtower/shared'

const SCOPE_BADGE_VARIANT: Record<PermissionScope, 'secondary' | 'default' | 'success'> = {
  NONE: 'secondary',
  OWN: 'default',
  ALL: 'success',
}

type PermAction = 'canRead' | 'canWrite' | 'canDelete'

// ─── Scope Badge ──────────────────────────────────────────────────────────────

function ScopeBadge({ scope }: { scope: PermissionScope }) {
  return (
    <Badge variant={SCOPE_BADGE_VARIANT[scope]} className="px-2 py-0.5 text-xs">
      {PERMISSION_SCOPE_LABELS[scope]}
    </Badge>
  )
}

// ─── Loading skeletons ────────────────────────────────────────────────────────

function RoleListSkeleton() {
  return (
    <div className="space-y-1 p-3">
      {[...Array(4)].map((_, i) => (
        <div key={`skeleton-role-${i}`} className="rounded-lg p-3 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </div>
  )
}

function RoleDetailSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={`skeleton-perm-${i}`} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}

// ─── Permissions Grid ─────────────────────────────────────────────────────────

interface PermissionsGridProps {
  permissions: RolePermission[]
  canWrite: boolean
  onChange: (resource: string, action: PermAction, value: PermissionScope) => void
}

function PermissionsGrid({ permissions, canWrite, onChange }: PermissionsGridProps) {
  const getPermission = useCallback(
    (resource: string, action: PermAction): PermissionScope => {
      const perm = permissions.find((p) => p.resource === resource)
      if (!perm) return 'NONE'
      return perm[action]
    },
    [permissions]
  )

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* Column headers */}
      <div className="flex items-center gap-4 bg-muted/30 px-6 py-2.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        <div className="w-40 shrink-0 pl-3">Risorsa</div>
        <div className="flex flex-1 items-center">
          <div className="flex-1 text-center">Lettura</div>
          <div className="flex-1 text-center">Scrittura</div>
          <div className="flex-1 text-center">Eliminazione</div>
        </div>
      </div>

      <div className="divide-y">
        {DISPLAY_RESOURCES.map((resource) => (
          <div
            key={resource}
            className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-muted/20"
          >
            {/* Resource name */}
            <div className="w-40 shrink-0 pl-3">
              <span className="text-sm font-medium">
                {RESOURCE_LABELS[resource] ?? resource}
              </span>
            </div>

            {/* Permission cells */}
            <div className="flex flex-1 items-center">
              {(['canRead', 'canWrite', 'canDelete'] as PermAction[]).map((action) => {
                const value = getPermission(resource, action)

                return (
                  <div key={action} className="flex flex-1 justify-center">
                    {canWrite ? (
                      <Select
                        value={value}
                        onValueChange={(val) =>
                          onChange(resource, action, val as PermissionScope)
                        }
                      >
                        <SelectTrigger className="h-7 w-[110px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE" className="text-xs">
                            Nessuno
                          </SelectItem>
                          <SelectItem value="OWN" className="text-xs">
                            Solo propri
                          </SelectItem>
                          <SelectItem value="ALL" className="text-xs">
                            Tutti
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <ScopeBadge scope={value} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Create Role Form ─────────────────────────────────────────────────────────

interface CreateRoleFormProps {
  onSubmit: (data: CreateRoleData) => void
  onCancel: () => void
  isPending: boolean
}

function CreateRoleForm({ onSubmit, onCancel, isPending }: CreateRoleFormProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Nuovo Ruolo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Crea un nuovo ruolo. Potrai configurare i permessi dopo la creazione.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="role-name">Nome *</Label>
          <Input
            id="role-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="es. Editor, Viewer..."
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role-description">Descrizione</Label>
          <Input
            id="role-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrizione opzionale del ruolo"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={isPending || !name.trim()}>
          {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Crea ruolo
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Annulla
        </Button>
      </div>
    </form>
  )
}

// ─── Role Detail Panel ────────────────────────────────────────────────────────

interface RoleDetailPanelProps {
  role: Role
  canWrite: boolean
  canDelete: boolean
  onUpdate: (data: UpdateRoleData) => void
  onUpdatePermissions: (data: UpdateRolePermissionsData) => void
  onDelete: () => void
  isUpdatePending: boolean
  isPermissionsPending: boolean
}

function RoleDetailPanel({
  role,
  canWrite,
  canDelete,
  onUpdate,
  onUpdatePermissions,
  onDelete,
  isUpdatePending,
  isPermissionsPending,
}: RoleDetailPanelProps) {
  const [editName, setEditName] = useState(role.name)
  const [editDescription, setEditDescription] = useState(role.description ?? '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [localPermissions, setLocalPermissions] = useState<RolePermission[]>(
    role.permissions
  )
  const [hasPermissionChanges, setHasPermissionChanges] = useState(false)

  // Reset local state when role changes
  const [prevRoleId, setPrevRoleId] = useState(role.id)
  if (role.id !== prevRoleId) {
    setPrevRoleId(role.id)
    setEditName(role.name)
    setEditDescription(role.description ?? '')
    setLocalPermissions(role.permissions)
    setHasPermissionChanges(false)
  }

  // Also sync when role data refreshes (e.g. after mutation)
  const [prevPermissions, setPrevPermissions] = useState(role.permissions)
  if (role.permissions !== prevPermissions) {
    setPrevPermissions(role.permissions)
    setLocalPermissions(role.permissions)
    setHasPermissionChanges(false)
  }

  const hasNameChanges = editName !== role.name || editDescription !== (role.description ?? '')

  const handleSaveMeta = () => {
    const data: UpdateRoleData = {}
    if (editName !== role.name) data.name = editName
    if (editDescription !== (role.description ?? '')) {
      data.description = editDescription.trim() || null
    }
    onUpdate(data)
  }

  const handlePermissionChange = (
    resource: string,
    action: PermAction,
    value: PermissionScope
  ) => {
    setLocalPermissions((prev) => {
      const existing = prev.find((p) => p.resource === resource)
      if (existing) {
        return prev.map((p) =>
          p.resource === resource ? { ...p, [action]: value } : p
        )
      }
      return [
        ...prev,
        {
          resource,
          canRead: action === 'canRead' ? value : 'NONE',
          canWrite: action === 'canWrite' ? value : 'NONE',
          canDelete: action === 'canDelete' ? value : 'NONE',
        },
      ]
    })
    setHasPermissionChanges(true)
  }

  const handleSavePermissions = () => {
    onUpdatePermissions({
      permissions: DISPLAY_RESOURCES.map((resource) => {
        const perm = localPermissions.find((p) => p.resource === resource)
        return {
          resource,
          canRead: perm?.canRead ?? 'NONE',
          canWrite: perm?.canWrite ?? 'NONE',
          canDelete: perm?.canDelete ?? 'NONE',
        }
      }),
    })
  }

  return (
    <div className="space-y-6 p-6">
      {/* Role header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight">{role.name}</h2>
              {role.isDefault && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Star className="h-3 w-3" />
                  Default
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {role._count.users} {role._count.users === 1 ? 'utente' : 'utenti'} assegnati
            </p>
          </div>
        </div>
        {canDelete && !role.isDefault && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Elimina
          </Button>
        )}
      </div>

      {/* Editable meta fields */}
      {canWrite ? (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Informazioni
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-role-name">Nome</Label>
              <Input
                id="edit-role-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role-desc">Descrizione</Label>
              <Input
                id="edit-role-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Descrizione opzionale"
              />
            </div>
          </div>
          {hasNameChanges && (
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleSaveMeta}
                disabled={isUpdatePending || !editName.trim()}
              >
                {isUpdatePending && (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                )}
                Salva modifiche
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditName(role.name)
                  setEditDescription(role.description ?? '')
                }}
              >
                Annulla
              </Button>
            </div>
          )}
        </div>
      ) : (
        role.description && (
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">{role.description}</p>
          </div>
        )
      )}

      {/* Permissions grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Permessi
        </h3>
        <PermissionsGrid
          permissions={localPermissions}
          canWrite={canWrite}
          onChange={handlePermissionChange}
        />
        {canWrite && hasPermissionChanges && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={handleSavePermissions}
              disabled={isPermissionsPending}
            >
              {isPermissionsPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-4 w-4" />
              )}
              Salva permessi
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLocalPermissions(role.permissions)
                setHasPermissionChanges(false)
              }}
            >
              Annulla
            </Button>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <DeleteConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        description={
          `Sei sicuro di voler eliminare il ruolo "${role.name}"?` +
          (role._count.users > 0
            ? ` Ci sono ancora ${role._count.users} ${role._count.users === 1 ? 'utente' : 'utenti'} assegnati a questo ruolo.`
            : '') +
          ' Questa azione non può essere annullata.'
        }
        onConfirm={() => {
          setShowDeleteConfirm(false)
          onDelete()
        }}
      />
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function RolesPage() {
  const queryClient = useQueryClient()
  const { can, isLoading: permissionsLoading } = usePermissions()

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // ── Queries ────────────────────────────────────────────────────────────────
  const {
    data: roles,
    isLoading,
    error,
  } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: api.getRoles,
  })

  const selectedRole = roles?.find((r) => r.id === selectedRoleId) ?? null

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data: CreateRoleData) => api.createRole(data),
    onSuccess: (newRole) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setIsCreating(false)
      setSelectedRoleId(newRole.id)
      toast.success('Ruolo creato con successo')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Errore durante la creazione del ruolo')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRoleData }) =>
      api.updateRole(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      toast.success('Ruolo aggiornato con successo')
    },
    onError: (err: Error) => {
      toast.error(err.message || "Errore durante l'aggiornamento del ruolo")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setSelectedRoleId(null)
      toast.success('Ruolo eliminato con successo')
    },
    onError: (err: Error) => {
      toast.error(err.message || "Errore durante l'eliminazione del ruolo")
    },
  })

  const permissionsMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRolePermissionsData }) =>
      api.updateRolePermissions(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      toast.success('Permessi aggiornati con successo')
    },
    onError: (err: Error) => {
      toast.error(err.message || "Errore durante l'aggiornamento dei permessi")
    },
  })

  // ── Access control ─────────────────────────────────────────────────────────
  const canWrite = !permissionsLoading && can('USER', 'write')
  const canDelete = !permissionsLoading && can('USER', 'delete')

  if (!permissionsLoading && !can('USER', 'read')) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h2 className="mt-4 text-lg font-semibold">Accesso negato</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Non hai i permessi necessari per visualizzare questa pagina.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ruoli</h1>
          {!isLoading && roles && (
            <p className="text-sm text-muted-foreground">
              {roles.length} {roles.length === 1 ? 'ruolo' : 'ruoli'} configurati
            </p>
          )}
        </div>
      </div>

      {/* Split panel layout */}
      <div className="flex gap-6 min-h-[600px]">
        {/* Left panel: Role list */}
        <div className="w-80 shrink-0 overflow-hidden rounded-xl border bg-card">
          {/* List header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">Elenco ruoli</span>
            {canWrite && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setIsCreating(true)
                  setSelectedRoleId(null)
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Nuovo
              </Button>
            )}
          </div>

          {/* Role items */}
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(600px - 49px)' }}>
            {isLoading ? (
              <RoleListSkeleton />
            ) : error ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-destructive">
                  Errore durante il caricamento dei ruoli.
                </p>
              </div>
            ) : !roles || roles.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Nessun ruolo configurato.
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-0.5">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => {
                      setSelectedRoleId(role.id)
                      setIsCreating(false)
                    }}
                    className={cn(
                      'w-full rounded-lg px-3 py-2.5 text-left transition-colors',
                      selectedRoleId === role.id
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted/50'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold truncate">
                        {role.name}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {role.isDefault && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                            <Star className="h-2.5 w-2.5" />
                            Default
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                          <Users className="h-2.5 w-2.5" />
                          {role._count.users}
                        </Badge>
                      </div>
                    </div>
                    {role.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground truncate">
                        {role.description}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right panel: Detail / Create / Placeholder */}
        <div className="flex-1 overflow-hidden rounded-xl border bg-card">
          {isCreating ? (
            <CreateRoleForm
              onSubmit={(data) => createMutation.mutate(data)}
              onCancel={() => setIsCreating(false)}
              isPending={createMutation.isPending}
            />
          ) : selectedRole ? (
            isLoading ? (
              <RoleDetailSkeleton />
            ) : (
              <RoleDetailPanel
                role={selectedRole}
                canWrite={canWrite}
                canDelete={canDelete}
                onUpdate={(data) =>
                  updateMutation.mutate({ id: selectedRole.id, data })
                }
                onUpdatePermissions={(data) =>
                  permissionsMutation.mutate({ id: selectedRole.id, data })
                }
                onDelete={() => deleteMutation.mutate(selectedRole.id)}
                isUpdatePending={updateMutation.isPending}
                isPermissionsPending={permissionsMutation.isPending}
              />
            )
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Shield className="mx-auto h-12 w-12 text-muted-foreground/20" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Seleziona un ruolo dalla lista per visualizzare i dettagli
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
