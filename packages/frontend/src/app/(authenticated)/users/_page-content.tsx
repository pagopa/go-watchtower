'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Loader2, Search, ArrowUpDown, ArrowUp, ArrowDown, Users } from 'lucide-react'
import { toast } from 'sonner'
import { api, type UserDetail } from '@/lib/api-client'
import { usePermissions } from '@/hooks/use-permissions'
import { useSortable } from '@/hooks/use-sortable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
import { cn } from '@/lib/utils'
import { AUTH_PROVIDER_LABELS } from '@go-watchtower/shared'
import type { AuthProvider } from '@go-watchtower/shared'

// ─── Avatar ───────────────────────────────────────────────────────────────────

const AVATAR_PALETTES = [
  'bg-blue-500 text-white',
  'bg-violet-500 text-white',
  'bg-emerald-500 text-white',
  'bg-amber-500 text-white',
  'bg-rose-500 text-white',
  'bg-cyan-500 text-white',
  'bg-indigo-500 text-white',
  'bg-teal-500 text-white',
]

function avatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length]
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

function UserAvatar({ name }: { name: string }) {
  return (
    <div
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
        avatarColor(name)
      )}
    >
      {getInitials(name)}
    </div>
  )
}

// ─── Sort header button ───────────────────────────────────────────────────────

type SortKey = 'name' | 'email' | 'roleName' | 'provider' | 'isActive'

function SortButton({
  columnKey,
  sortConfig,
  onSort,
  children,
  className,
}: {
  columnKey: SortKey
  sortConfig: { key: SortKey; direction: 'asc' | 'desc' } | null
  onSort: (key: SortKey) => void
  children: React.ReactNode
  className?: string
}) {
  const isActive = sortConfig?.key === columnKey
  const direction = isActive ? sortConfig!.direction : null

  return (
    <button
      type="button"
      onClick={() => onSort(columnKey)}
      className={cn(
        'flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 transition-colors hover:text-foreground',
        isActive && 'text-foreground',
        className
      )}
    >
      {children}
      <span className="ml-0.5">
        {direction === 'asc' ? (
          <ArrowUp className="h-3 w-3" />
        ) : direction === 'desc' ? (
          <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </button>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function UserRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <Skeleton className="h-9 w-9 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-5 w-20" />
      <Skeleton className="h-5 w-16" />
      <Skeleton className="h-5 w-16" />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function UsersPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { can, isLoading: permissionsLoading } = usePermissions()
  const [deleteUser, setDeleteUser] = useState<UserDetail | null>(null)
  const [search, setSearch] = useState('')

  const { data: users, isLoading, error } = useQuery<UserDetail[]>({
    queryKey: ['users'],
    queryFn: api.getUsers,
  })

  const { sortedData: sortedUsers, sortConfig, requestSort } = useSortable<UserDetail, SortKey>(users, 'name')

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return sortedUsers
    const q = search.trim().toLowerCase()
    return sortedUsers?.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.roleName.toLowerCase().includes(q)
    )
  }, [sortedUsers, search])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Utente eliminato con successo')
      setDeleteUser(null)
    },
    onError: (err: Error) => {
      toast.error(err.message || "Errore durante l'eliminazione")
    },
  })

  const canWrite = !permissionsLoading && can('USER', 'write')
  const canDelete = !permissionsLoading && can('USER', 'delete')

  const totalCount = users?.length ?? 0
  const activeCount = users?.filter((u) => u.isActive).length ?? 0

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Utenti</h1>
            {!isLoading && (
              <p className="text-sm text-muted-foreground">
                {totalCount} {totalCount === 1 ? 'utente' : 'utenti'}
                {' · '}
                <span className="text-emerald-600 dark:text-emerald-400">
                  {activeCount} {activeCount === 1 ? 'attivo' : 'attivi'}
                </span>
              </p>
            )}
          </div>
        </div>
        {canWrite && (
          <Button asChild size="sm">
            <Link href="/users/new">
              <Plus className="mr-1.5 h-4 w-4" />
              Nuovo Utente
            </Link>
          </Button>
        )}
      </div>

      {/* ── Main card ── */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">

        {/* Search + column headers */}
        <div className="border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Cerca per nome, email o ruolo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9 text-sm"
            />
          </div>
        </div>

        {/* Column labels */}
        <div className="hidden grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 border-b border-border/60 bg-muted/30 px-5 py-2.5 md:grid">
          <div className="w-9" />
          <SortButton columnKey="name" sortConfig={sortConfig} onSort={requestSort}>
            Utente
          </SortButton>
          <SortButton columnKey="roleName" sortConfig={sortConfig} onSort={requestSort} className="w-28">
            Ruolo
          </SortButton>
          <SortButton columnKey="provider" sortConfig={sortConfig} onSort={requestSort} className="w-20">
            Provider
          </SortButton>
          <SortButton columnKey="isActive" sortConfig={sortConfig} onSort={requestSort} className="w-20">
            Stato
          </SortButton>
          {(canWrite || canDelete) && <div className="w-16" />}
        </div>

        {/* Rows */}
        <div className="divide-y divide-border/60">
          {isLoading ? (
            <>
              <UserRowSkeleton />
              <UserRowSkeleton />
              <UserRowSkeleton />
              <UserRowSkeleton />
              <UserRowSkeleton />
            </>
          ) : error ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-destructive">
                Errore durante il caricamento degli utenti.
              </p>
            </div>
          ) : !filteredUsers || filteredUsers.length === 0 ? (
            <div className="px-5 py-16 text-center">
              {search ? (
                <>
                  <p className="text-sm font-medium text-foreground">
                    Nessun risultato per &ldquo;{search}&rdquo;
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Prova con un termine diverso.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Nessun utente trovato.</p>
                  {canWrite && (
                    <Button asChild size="sm" className="mt-4">
                      <Link href="/users/new">
                        <Plus className="mr-1.5 h-4 w-4" />
                        Crea il primo utente
                      </Link>
                    </Button>
                  )}
                </>
              )}
            </div>
          ) : (
            filteredUsers.map((user) => (
              <div
                key={user.id}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('a, button')) return
                  router.push(`/users/${user.id}`)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') router.push(`/users/${user.id}`)
                }}
                className="group grid grid-cols-[auto_1fr] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/40 cursor-pointer md:grid-cols-[auto_1fr_auto_auto_auto_auto]"
              >
                {/* Avatar */}
                <UserAvatar name={user.name} />

                {/* Name + email */}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>

                {/* Role */}
                <div className="hidden w-28 md:block">
                  <Badge variant="outline" className="text-xs font-medium">
                    {user.roleName}
                  </Badge>
                </div>

                {/* Provider */}
                <div className="hidden w-20 md:block">
                  <span className="text-xs text-muted-foreground">
                    {AUTH_PROVIDER_LABELS[user.provider as AuthProvider] ?? user.provider}
                  </span>
                </div>

                {/* Status */}
                <div className="hidden w-20 items-center gap-1.5 md:flex">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      user.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                    )}
                  />
                  <span
                    className={cn(
                      'text-xs font-medium',
                      user.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/60'
                    )}
                  >
                    {user.isActive ? 'Attivo' : 'Inattivo'}
                  </span>
                </div>

                {/* Actions — reveal on row hover */}
                {(canWrite || canDelete) && (
                  <div className="flex w-16 items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {canWrite && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                        <Link href={`/users/${user.id}`} onClick={(e) => e.stopPropagation()}>
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="sr-only">Modifica</span>
                        </Link>
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); setDeleteUser(user) }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        <span className="sr-only">Elimina</span>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer count */}
        {!isLoading && filteredUsers && filteredUsers.length > 0 && (
          <div className="border-t border-border/60 bg-muted/20 px-5 py-2.5">
            <p className="text-xs text-muted-foreground">
              {search
                ? `${filteredUsers.length} di ${totalCount} utenti`
                : `${totalCount} ${totalCount === 1 ? 'utente' : 'utenti'}`}
            </p>
          </div>
        )}
      </div>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deleteUser} onOpenChange={() => setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare l&apos;utente{' '}
              <span className="font-medium text-foreground">&ldquo;{deleteUser?.name}&rdquo;</span>?
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUser && deleteMutation.mutate(deleteUser.id)}
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
