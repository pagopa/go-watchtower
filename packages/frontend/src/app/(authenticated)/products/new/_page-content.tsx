'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, type CreateProductData } from '@/lib/api-client'
import { invalidate } from '@/lib/query-invalidation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const productSchema = z.object({
  name: z.string().min(3, 'Il nome deve avere almeno 3 caratteri'),
  description: z.string().min(10, 'La descrizione deve avere almeno 10 caratteri'),
  isActive: z.boolean(),
})

type ProductFormData = z.infer<typeof productSchema>

export function NewProductPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      description: '',
      isActive: true,
    },
  })

  const isActive = watch('isActive')

  const createMutation = useMutation({
    mutationFn: (data: CreateProductData) => api.createProduct(data),
    onSuccess: () => {
      invalidate(queryClient, 'products')
      toast.success('Prodotto creato con successo')
      router.push('/products')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante la creazione')
    },
  })

  const onSubmit = (data: ProductFormData) => {
    createMutation.mutate(data)
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href="/products">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Torna alla lista
        </Link>
      </Button>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Nuovo Prodotto</CardTitle>
          <CardDescription>
            Crea un nuovo prodotto nel sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                placeholder="Nome del prodotto"
                {...register('name')}
                disabled={createMutation.isPending}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrizione</Label>
              <Textarea
                id="description"
                placeholder="Descrizione del prodotto"
                rows={4}
                {...register('description')}
                disabled={createMutation.isPending}
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="isActive">Stato</Label>
                <p className="text-sm text-muted-foreground">
                  {isActive ? 'Il prodotto è attivo' : 'Il prodotto è inattivo'}
                </p>
              </div>
              <Switch
                id="isActive"
                checked={isActive}
                onCheckedChange={(checked) => setValue('isActive', checked)}
                disabled={createMutation.isPending}
              />
            </div>

            <div className="flex gap-4">
              <Button
                type="submit"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Crea Prodotto
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={createMutation.isPending}
              >
                Annulla
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
