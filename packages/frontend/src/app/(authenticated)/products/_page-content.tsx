'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, type Product } from '@/lib/api-client'
import { usePermissions } from '@/hooks/use-permissions'
import { useSortable } from '@/hooks/use-sortable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SortableTableHead } from '@/components/ui/sortable-table-head'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ProductsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { can, isLoading: permissionsLoading } = usePermissions()
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null)

  const {
    data: products,
    isLoading,
    error,
  } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: api.getProducts,
  })

  type ProductSortKey = 'name' | 'isActive' | 'createdAt'
  const { sortedData: sortedProducts, sortConfig, requestSort } = useSortable<Product, ProductSortKey>(products, 'name')

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Prodotto eliminato con successo')
      setDeleteProduct(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante l\'eliminazione')
    },
  })

  const canWrite = !permissionsLoading && can('PRODUCT', 'write')
  const canDelete = !permissionsLoading && can('PRODUCT', 'delete')

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-36" />
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="space-y-4 p-6">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={`skeleton-${i}`} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-destructive">
            Errore durante il caricamento dei prodotti.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Prodotti</h1>
          <p className="text-muted-foreground">
            Gestisci i prodotti del sistema
          </p>
        </div>
        {canWrite && (
          <Button asChild>
            <Link href="/products/new">
              <Plus className="mr-2 h-4 w-4" />
              Nuovo Prodotto
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista Prodotti</CardTitle>
          <CardDescription>
            {products?.length || 0} prodotti totali
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedProducts && sortedProducts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead columnKey="name" sortConfig={sortConfig} onSort={requestSort}>Nome</SortableTableHead>
                  <TableHead>Descrizione</TableHead>
                  <SortableTableHead columnKey="isActive" sortConfig={sortConfig} onSort={requestSort}>Stato</SortableTableHead>
                  <SortableTableHead columnKey="createdAt" sortConfig={sortConfig} onSort={requestSort}>Creato il</SortableTableHead>
                  {(canWrite || canDelete) && (
                    <TableHead className="w-24 text-right">Azioni</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProducts.map((product) => (
                  <TableRow
                    key={product.id}
                    className="cursor-pointer"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('a, button')) return
                      router.push(`/products/${product.id}`)
                    }}
                  >
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {product.description}
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.isActive ? 'success' : 'secondary'}>
                        {product.isActive ? 'Attivo' : 'Inattivo'}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(product.createdAt)}</TableCell>
                    {(canWrite || canDelete) && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {canWrite && (
                            <Button variant="ghost" size="icon" asChild>
                              <Link href={`/products/${product.id}/edit`}>
                                <Pencil className="h-4 w-4" />
                                <span className="sr-only">Modifica</span>
                              </Link>
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteProduct(product)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                              <span className="sr-only">Elimina</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">Nessun prodotto trovato.</p>
              {canWrite && (
                <Button asChild className="mt-4">
                  <Link href="/products/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Crea il primo prodotto
                  </Link>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteProduct} onOpenChange={() => setDeleteProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare il prodotto &quot;{deleteProduct?.name}&quot;?
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteProduct && deleteMutation.mutate(deleteProduct.id)}
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
