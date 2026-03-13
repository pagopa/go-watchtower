'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, type Product, type UpdateProductData } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { invalidate } from '@/lib/query-invalidation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const productSchema = z.object({
  name: z.string().min(3, 'Il nome deve avere almeno 3 caratteri'),
  description: z.string().min(10, 'La descrizione deve avere almeno 10 caratteri'),
  isActive: z.boolean(),
})

type ProductFormData = z.infer<typeof productSchema>

export function EditProductPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()

  const productId = params.id as string

  const {
    data: product,
    isLoading,
    error,
  } = useQuery<Product>({
    queryKey: qk.products.detail(productId),
    queryFn: () => api.getProduct(productId),
  })

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
    values: product ? {
      name: product.name,
      description: product.description,
      isActive: product.isActive,
    } : undefined,
  })

  const isActive = watch('isActive')

  const updateMutation = useMutation({
    mutationFn: (data: UpdateProductData) => api.updateProduct(productId, data),
    onSuccess: () => {
      invalidate(queryClient, 'products')
      toast.success('Prodotto aggiornato con successo')
      router.push(`/products/${productId}`)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante l\'aggiornamento')
    },
  })

  const onSubmit = (data: ProductFormData) => {
    updateMutation.mutate(data)
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-32" />
        <Card className="max-w-2xl">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/products">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Torna alla lista
          </Link>
        </Button>
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">Prodotto non trovato.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href={`/products/${productId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Torna al prodotto
        </Link>
      </Button>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Modifica Prodotto</CardTitle>
          <CardDescription>
            Modifica i dettagli del prodotto
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
                disabled={updateMutation.isPending}
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
                disabled={updateMutation.isPending}
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
                disabled={updateMutation.isPending}
              />
            </div>

            <div className="flex gap-4">
              <Button
                type="submit"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Salva Modifiche
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={updateMutation.isPending}
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
