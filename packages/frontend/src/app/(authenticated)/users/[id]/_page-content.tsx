'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Trash2, Loader2, X, CalendarDays, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  api,
  type UserDetailWithOverrides,
  type UserWithPermissions,
  type Role,
  type PermissionScope,
} from '@/lib/api-client'
import { usePermissions } from '@/hooks/use-permissions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { DISPLAY_RESOURCES, RESOURCE_LABELS, PERMISSION_SCOPE_LABELS } from '@go-watchtower/shared'

const SCOPE_BADGE_VARIANT: Record<PermissionScope, 'secondary' | 'default' | 'success'> = {
  NONE: 'secondary',
  OWN: 'default',
  ALL: 'success',
}

type PermAction = 'canRead' | 'canWrite' | 'canDelete'

/**
 * Value for the select: "inherit" means remove the override (null),
 * otherwise it is the PermissionScope string.
 */
type OverrideSelectValue = 'inherit' | PermissionScope

function UserAvatar({ name }: { name: string }) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-base font-bold select-none">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function ScopeBadge({ scope }: { scope: PermissionScope }) {
  return (
    <Badge variant={SCOPE_BADGE_VARIANT[scope]} className="px-2 py-0.5 text-xs">
      {PERMISSION_SCOPE_LABELS[scope]}
    </Badge>
  )
}

export function UserDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { can, isLoading: permissionsLoading } = usePermissions()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const userId = params.id as string

  const {
    data: user,
    isLoading: userLoading,
    error: userError,
  } = useQuery<UserDetailWithOverrides>({
    queryKey: ['users', userId],
    queryFn: () => api.getUser(userId),
  })

  const { data: userPermissions, isLoading: permLoading } = useQuery<UserWithPermissions>({
    queryKey: ['users', userId, 'permissions'],
    queryFn: () => api.getUserPermissions(userId),
  })

  const { data: roles } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: api.getRoles,
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Utente eliminato con successo')
      router.push('/users')
    },
    onError: (error: Error) => {
      toast.error(error.message || "Errore durante l'eliminazione")
    },
  })

  const changeRoleMutation = useMutation({
    mutationFn: (roleId: string) => api.updateUser(userId, { roleId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', userId] })
      queryClient.invalidateQueries({ queryKey: ['users', userId, 'permissions'] })
      toast.success('Ruolo aggiornato con successo')
    },
    onError: (error: Error) => {
      toast.error(error.message || "Errore durante l'aggiornamento del ruolo")
    },
  })

  const setOverrideMutation = useMutation({
    mutationFn: ({ resource, action, value }: { resource: string; action: PermAction; value: PermissionScope | null }) =>
      api.setUserPermissionOverride(userId, { resource, [action]: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', userId] })
      queryClient.invalidateQueries({ queryKey: ['users', userId, 'permissions'] })
      toast.success('Override permesso impostato')
    },
    onError: (error: Error) => {
      toast.error(error.message || "Errore durante l'aggiornamento")
    },
  })

  const removeOverrideMutation = useMutation({
    mutationFn: (resource: string) => api.removeUserPermissionOverride(userId, resource),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', userId] })
      queryClient.invalidateQueries({ queryKey: ['users', userId, 'permissions'] })
      toast.success('Override permesso rimosso')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante la rimozione')
    },
  })

  const canWrite = !permissionsLoading && can('USER', 'write')
  const canDelete = !permissionsLoading && can('USER', 'delete')

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  if (userLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-5 w-36" />
        <div className="rounded-xl border p-6 space-y-4">
          <div className="flex gap-4">
            <Skeleton className="h-11 w-11 rounded-full shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 border-t pt-4">
            {[...Array(4)].map((_, i) => <Skeleton key={`skeleton-meta-${i}`} className="h-10" />)}
          </div>
        </div>
        <div className="rounded-xl border p-6 space-y-3">
          <Skeleton className="h-5 w-32" />
          {[...Array(5)].map((_, i) => <Skeleton key={`skeleton-perm-${i}`} className="h-14 w-full" />)}
        </div>
      </div>
    )
  }

  if (userError || !user) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground hover:text-foreground">
          <Link href="/users">
            <ArrowLeft className="mr-2 h-3.5 w-3.5" />
            Tutti gli utenti
          </Link>
        </Button>
        <div className="rounded-xl border p-8 text-center">
          <p className="text-sm text-destructive">Utente non trovato.</p>
        </div>
      </div>
    )
  }

  const getRolePermission = (resource: string, action: PermAction): PermissionScope => {
    if (!userPermissions) return 'NONE'
    const rp = userPermissions.rolePermissions.find((p) => p.resource === resource)
    if (!rp) return 'NONE'
    return rp[action]
  }

  const getOverride = (resource: string) => {
    if (!userPermissions) return null
    return userPermissions.overrides.find((o) => o.resource === resource) ?? null
  }

  const getOverrideValue = (resource: string, action: PermAction): PermissionScope | null => {
    const override = getOverride(resource)
    if (!override) return null
    return override[action]
  }

  const handleOverrideChange = (resource: string, action: PermAction, selectValue: OverrideSelectValue) => {
    if (selectValue === 'inherit') {
      // Setting to "inherit" means we want to null out this specific action.
      // If all three actions in the override are null after this, we remove the entire override.
      const override = getOverride(resource)
      if (!override) return

      // Check if other actions still have overrides
      const otherActions = (['canRead', 'canWrite', 'canDelete'] as PermAction[]).filter((a) => a !== action)
      const hasOtherOverrides = otherActions.some((a) => override[a] !== null)

      if (!hasOtherOverrides) {
        // No other action overrides remain -- remove the entire resource override
        removeOverrideMutation.mutate(resource)
      } else {
        // Null out just this action
        setOverrideMutation.mutate({ resource, action, value: null })
      }
    } else {
      setOverrideMutation.mutate({ resource, action, value: selectValue })
    }
  }

  const currentRole = roles?.find((r) => r.name === user.roleName)
  const overrideCount = userPermissions?.overrides.length ?? 0

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="-ml-2 text-muted-foreground hover:text-foreground"
      >
        <Link href="/users">
          <ArrowLeft className="mr-2 h-3.5 w-3.5" />
          Tutti gli utenti
        </Link>
      </Button>

      {/* User Hero */}
      <div className="relative overflow-hidden rounded-xl border bg-card">
        <div
          className={cn(
            'absolute left-0 top-0 h-full w-1',
            user.isActive ? 'bg-success' : 'bg-muted-foreground/25',
          )}
        />
        <div className="pl-7 pr-6 py-5">
          <div className="flex items-start justify-between gap-4">
            {/* Identity */}
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <UserAvatar name={user.name} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      user.isActive ? 'bg-success' : 'bg-muted-foreground/40',
                    )}
                  />
                  <span
                    className={cn(
                      'text-xs font-semibold uppercase tracking-widest',
                      user.isActive ? 'text-success' : 'text-muted-foreground',
                    )}
                  >
                    {user.isActive ? 'Attivo' : 'Inattivo'}
                  </span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight leading-tight">
                  {user.name}
                </h1>
                <p className="mt-0.5 text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>

            {/* Actions */}
            {(canWrite || canDelete) && (
              <div className="flex shrink-0 gap-2">
                {canWrite && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/users/${userId}/edit`}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Modifica
                    </Link>
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Elimina
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Meta grid */}
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 border-t pt-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Provider
              </dt>
              <dd className="mt-1.5">
                <Badge variant="secondary" className="text-xs font-mono">
                  {user.provider}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Ruolo
              </dt>
              <dd className="mt-1.5">
                {canWrite ? (
                  <Select
                    value={currentRole?.id}
                    onValueChange={(roleId) => changeRoleMutation.mutate(roleId)}
                    disabled={changeRoleMutation.isPending}
                  >
                    <SelectTrigger className="h-7 w-44 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles?.map((role) => (
                        <SelectItem key={role.id} value={role.id} className="text-xs">
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    {user.roleName}
                  </Badge>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                Creato
              </dt>
              <dd className="mt-1.5 text-sm tabular-nums">{formatDate(user.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                Aggiornato
              </dt>
              <dd className="mt-1.5 text-sm tabular-nums">{formatDate(user.updatedAt)}</dd>
            </div>
          </div>
        </div>
      </div>

      {/* Permissions panel */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              Permessi
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Valori da ruolo in grigio &middot; override specifici in colore
              {overrideCount > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {overrideCount} override
                </span>
              )}
            </p>
          </div>
        </div>

        {permLoading ? (
          <div className="divide-y">
            {[...Array(6)].map((_, i) => (
              <div key={`skeleton-row-${i}`} className="flex items-center gap-4 px-6 py-3">
                <Skeleton className="h-4 w-32" />
                <div className="flex flex-1 gap-6">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className="flex items-center gap-4 bg-muted/30 px-6 py-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <div className="w-40 shrink-0 pl-3">Risorsa</div>
              <div className="flex flex-1 items-center">
                <div className="flex-1 text-center">Lettura</div>
                <div className="flex-1 text-center">Scrittura</div>
                <div className="flex-1 text-center">Eliminazione</div>
              </div>
              {canWrite && <div className="w-8 shrink-0" />}
            </div>

            <div className="divide-y">
              {DISPLAY_RESOURCES.map((resource) => {
                const override = getOverride(resource)
                const hasOverride = override !== null

                return (
                  <div
                    key={resource}
                    className={cn(
                      'relative flex items-center gap-4 px-6 py-3 transition-colors',
                      hasOverride
                        ? 'bg-primary/[0.025]'
                        : 'hover:bg-muted/20',
                    )}
                  >
                    {/* Override accent bar */}
                    {hasOverride && (
                      <div className="absolute left-0 top-0 h-full w-0.5 bg-primary/50" />
                    )}

                    {/* Resource name */}
                    <div className="w-40 shrink-0 pl-3">
                      <span className="text-sm font-medium">{RESOURCE_LABELS[resource] ?? resource}</span>
                      {hasOverride && (
                        <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-primary/70">
                          override
                        </div>
                      )}
                    </div>

                    {/* Permission cells */}
                    <div className="flex flex-1 items-center">
                      {(['canRead', 'canWrite', 'canDelete'] as PermAction[]).map((action) => {
                        const roleValue = getRolePermission(resource, action)
                        const overrideValue = getOverrideValue(resource, action)
                        const hasActionOverride = overrideValue !== null
                        const effectiveValue = hasActionOverride ? overrideValue : roleValue

                        return (
                          <div key={action} className="flex flex-1 flex-col items-center gap-1.5">
                            {canWrite ? (
                              <Select
                                value={hasActionOverride ? overrideValue : 'inherit'}
                                onValueChange={(val) =>
                                  handleOverrideChange(resource, action, val as OverrideSelectValue)
                                }
                                disabled={setOverrideMutation.isPending || removeOverrideMutation.isPending}
                              >
                                <SelectTrigger className={cn(
                                  "h-7 w-[120px] text-xs",
                                  hasActionOverride && "border-primary/30"
                                )}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="inherit" className="text-xs">
                                    <span className="text-muted-foreground">Eredita dal ruolo</span>
                                    <span className="ml-1 text-[10px] text-muted-foreground/60">({PERMISSION_SCOPE_LABELS[roleValue]})</span>
                                  </SelectItem>
                                  <SelectItem value="NONE" className="text-xs">Nessuno (NONE)</SelectItem>
                                  <SelectItem value="OWN" className="text-xs">Solo propri (OWN)</SelectItem>
                                  <SelectItem value="ALL" className="text-xs">Tutti (ALL)</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <ScopeBadge scope={effectiveValue} />
                            )}
                            <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                              ruolo: {PERMISSION_SCOPE_LABELS[roleValue]}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    {/* Reset */}
                    {canWrite && (
                      <div className="flex w-8 shrink-0 justify-center">
                        {hasOverride && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => removeOverrideMutation.mutate(resource)}
                            disabled={removeOverrideMutation.isPending}
                            title="Rimuovi override"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Delete dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare l&apos;utente &quot;{user.name}&quot;?
              Questa azione non pu&ograve; essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
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
