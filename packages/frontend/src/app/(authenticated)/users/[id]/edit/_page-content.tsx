'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  api,
  type UserDetailWithOverrides,
  type UpdateUserData,
  type Role,
} from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

const userSchema = z.object({
  name: z.string().min(1, 'Il nome è obbligatorio'),
  email: z.string().email('Email non valida'),
  isActive: z.boolean(),
  roleId: z.string().optional(),
})

type UserFormData = z.infer<typeof userSchema>

export function EditUserPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()

  const userId = params.id as string

  const {
    data: user,
    isLoading: userLoading,
    error: userError,
  } = useQuery<UserDetailWithOverrides>({
    queryKey: ['users', userId],
    queryFn: () => api.getUser(userId),
  })

  const { data: roles } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: api.getRoles,
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: { name: '', email: '', isActive: true, roleId: undefined },
  })

  useEffect(() => {
    if (user && roles) {
      const currentRole = roles.find((r) => r.name === user.roleName)
      reset({
        name: user.name,
        email: user.email,
        isActive: user.isActive,
        roleId: currentRole?.id,
      })
    }
  }, [user, roles, reset])

  const isActive = watch('isActive')
  const selectedRoleId = watch('roleId')

  const updateMutation = useMutation({
    mutationFn: (data: UpdateUserData) => api.updateUser(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Utente aggiornato con successo')
      router.push(`/users/${userId}`)
    },
    onError: (error: Error) => {
      toast.error(error.message || "Errore durante l'aggiornamento")
    },
  })

  const onSubmit = (data: UserFormData) => updateMutation.mutate(data)

  if (userLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-5 w-36" />
        <div className="rounded-xl border p-6 space-y-5 max-w-xl">
          <Skeleton className="h-6 w-40" />
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
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

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="-ml-2 text-muted-foreground hover:text-foreground"
      >
        <Link href={`/users/${userId}`}>
          <ArrowLeft className="mr-2 h-3.5 w-3.5" />
          {user.name}
        </Link>
      </Button>

      {/* Form panel */}
      <div className="max-w-xl rounded-xl border bg-card overflow-hidden">
        {/* Panel header */}
        <div className="border-b px-6 py-4">
          <h1 className="font-semibold">Modifica utente</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Aggiorna nome, email, ruolo e stato di{' '}
            <span className="font-medium text-foreground">{user.name}</span>
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="divide-y">
          {/* Name */}
          <div className="flex items-start gap-6 px-6 py-4">
            <div className="w-28 shrink-0 pt-2">
              <Label htmlFor="name" className="text-sm font-medium">
                Nome
              </Label>
            </div>
            <div className="flex-1 space-y-1.5">
              <Input
                id="name"
                placeholder="Nome completo"
                {...register('name')}
                disabled={updateMutation.isPending}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
          </div>

          {/* Email */}
          <div className="flex items-start gap-6 px-6 py-4">
            <div className="w-28 shrink-0 pt-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
            </div>
            <div className="flex-1 space-y-1.5">
              <Input
                id="email"
                type="email"
                placeholder="email@esempio.it"
                {...register('email')}
                disabled={updateMutation.isPending}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>
          </div>

          {/* Role */}
          <div className="flex items-start gap-6 px-6 py-4">
            <div className="w-28 shrink-0 pt-2">
              <Label className="text-sm font-medium">Ruolo</Label>
            </div>
            <div className="flex-1">
              <Select
                value={selectedRoleId}
                onValueChange={(value) => setValue('roleId', value)}
                disabled={updateMutation.isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona un ruolo" />
                </SelectTrigger>
                <SelectContent>
                  {roles?.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      <span className="font-medium">{role.name}</span>
                      {role.description && (
                        <span className="ml-2 text-muted-foreground text-xs">{role.description}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              <Label htmlFor="isActive" className="text-sm font-medium cursor-pointer">
                Stato account
              </Label>
              <p className={cn(
                'mt-0.5 text-xs transition-colors',
                isActive ? 'text-success' : 'text-muted-foreground',
              )}>
                {isActive ? 'L\'utente può accedere al sistema' : 'Accesso disabilitato'}
              </p>
            </div>
            <Switch
              id="isActive"
              checked={isActive}
              onCheckedChange={(checked) => setValue('isActive', checked)}
              disabled={updateMutation.isPending}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 bg-muted/20 px-6 py-4">
            <Button type="submit" disabled={updateMutation.isPending} size="sm">
              {updateMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Salva modifiche
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              disabled={updateMutation.isPending}
            >
              Annulla
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
