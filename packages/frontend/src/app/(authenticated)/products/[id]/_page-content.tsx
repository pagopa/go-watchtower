'use client'

import { useState, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Server,
  Box,
  BookOpen,
  Bell,
  BellOff,
  ArrowDownRight,
  CheckCircle2,
  CalendarDays,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { api, type Product } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { invalidate } from '@/lib/query-invalidation'
import { formatDateTime as formatDate } from '@/lib/format'
import { usePermissions } from '@/hooks/use-permissions'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog'
import { EnvironmentsTab } from './_components/environments-tab'
import { ResourcesTab } from './_components/resources-tab'
import { RunbooksTab } from './_components/runbooks-tab'
import { AlarmsTab } from './_components/alarms-tab'
import { DownstreamsTab } from './_components/downstreams-tab'
import { FinalActionsTab } from './_components/final-actions-tab'
import { IgnoredAlarmsTab } from './_components/ignored-alarms-tab'

const TAB_TRIGGER_CLASS =
  'justify-start gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground whitespace-nowrap ' +
  'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm ' +
  'hover:text-foreground hover:bg-background/60 transition-colors'

function TabCount({ count }: { count: number | undefined }) {
  return (
    <span
      className={cn(
        'ml-auto min-w-5 rounded-full px-1.5 text-[10px] font-semibold tabular-nums text-center leading-5',
        count != null && count > 0
          ? 'bg-primary/10 text-primary'
          : 'bg-muted/80 text-muted-foreground/40',
      )}
    >
      {count ?? '·'}
    </span>
  )
}

function ProductDetailContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { can, isLoading: permissionsLoading } = usePermissions()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const productId = params.id as string

  const {
    data: product,
    isLoading,
    error,
    refetch,
  } = useQuery<Product>({
    queryKey: qk.products.detail(productId),
    queryFn: () => api.getProduct(productId),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteProduct(productId),
    onSuccess: () => {
      invalidate(queryClient, 'products')
      toast.success('Prodotto eliminato con successo')
      router.push('/products')
    },
    onError: (error: Error) => {
      toast.error(error.message || "Errore durante l'eliminazione")
    },
  })

  const canWrite = !permissionsLoading && can('PRODUCT', 'write')
  const canDelete = !permissionsLoading && can('PRODUCT', 'delete')
  const canReadEnvironments = permissionsLoading || can('ENVIRONMENT', 'read')
  const canReadResources = permissionsLoading || can('RESOURCE', 'read')
  const canReadRunbooks = permissionsLoading || can('RUNBOOK', 'read')
  const canReadAlarms = permissionsLoading || can('ALARM', 'read')
  const canReadDownstreams = permissionsLoading || can('DOWNSTREAM', 'read')
  const canReadFinalActions = permissionsLoading || can('FINAL_ACTION', 'read')
  const canReadIgnoredAlarms = permissionsLoading || can('IGNORED_ALARM', 'read')

  // Tab configuration — must be before early returns so hooks are stable
  const hasAnyTab =
    canReadEnvironments || canReadResources || canReadRunbooks || canReadAlarms ||
    canReadDownstreams || canReadFinalActions || canReadIgnoredAlarms

  const firstTab = canReadEnvironments
    ? 'environments'
    : canReadResources
      ? 'resources'
      : canReadRunbooks
        ? 'runbooks'
        : canReadAlarms
          ? 'alarms'
          : canReadIgnoredAlarms
            ? 'ignored-alarms'
            : canReadDownstreams
              ? 'downstreams'
              : 'final-actions'

  // Controlled tab state synced to URL
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') ?? firstTab)

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', value)
    window.history.replaceState(null, '', url.toString())
  }

  // Pre-fetch sub-resource counts — shares TanStack Query cache with tab components,
  // so switching tabs is instant (data already in cache).
  const productLoaded = !!product
  const { data: envCount } = useQuery({
    queryKey: qk.products.environments(productId),
    queryFn: () => api.getEnvironments(productId),
    select: (data) => data.length,
    enabled: canReadEnvironments && productLoaded,
  })
  const { data: resourceCount } = useQuery({
    queryKey: qk.products.resources(productId),
    queryFn: () => api.getResources(productId),
    select: (data) => data.length,
    enabled: canReadResources && productLoaded,
  })
  const { data: runbookCount } = useQuery({
    queryKey: qk.products.runbooks(productId),
    queryFn: () => api.getRunbooks(productId),
    select: (data) => data.length,
    enabled: canReadRunbooks && productLoaded,
  })
  const { data: alarmCount } = useQuery({
    queryKey: qk.products.alarms(productId),
    queryFn: () => api.getAlarms(productId),
    select: (data) => data.length,
    enabled: canReadAlarms && productLoaded,
  })
  const { data: ignoredAlarmCount } = useQuery({
    queryKey: qk.products.ignoredAlarms(productId),
    queryFn: () => api.getIgnoredAlarms(productId),
    select: (data) => data.length,
    enabled: canReadIgnoredAlarms && productLoaded,
  })
  const { data: downstreamCount } = useQuery({
    queryKey: qk.products.downstreams(productId),
    queryFn: () => api.getDownstreams(productId),
    select: (data) => data.length,
    enabled: canReadDownstreams && productLoaded,
  })
  const { data: finalActionCount } = useQuery({
    queryKey: qk.products.finalActions(productId),
    queryFn: () => api.getFinalActions(productId),
    select: (data) => data.length,
    enabled: canReadFinalActions && productLoaded,
  })

  if (isLoading && !product) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-5 w-40" />
        <div className="rounded-xl border p-6 space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-4 w-full max-w-md" />
          <div className="flex gap-6 border-t pt-4">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-56 w-48 rounded-xl" />
          <Skeleton className="flex-1 h-56 rounded-xl" />
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground hover:text-foreground">
          <Link href="/products">
            <ArrowLeft className="mr-2 h-3.5 w-3.5" />
            Tutti i prodotti
          </Link>
        </Button>
        <div className="rounded-xl border p-8 text-center space-y-3">
          <p className="text-sm text-destructive">Prodotto non trovato.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Riprova
          </Button>
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
        <Link href="/products">
          <ArrowLeft className="mr-2 h-3.5 w-3.5" />
          Tutti i prodotti
        </Link>
      </Button>

      {/* Product Hero */}
      <div className="relative overflow-hidden rounded-xl border bg-card">
        {/* Status accent bar */}
        <div
          className={cn(
            'absolute left-0 top-0 h-full w-1',
            product.isActive ? 'bg-success' : 'bg-muted-foreground/25',
          )}
        />

        <div className="pl-7 pr-6 py-5">
          <div className="flex items-start justify-between gap-4">
            {/* Identity */}
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2">
                <div
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    product.isActive ? 'bg-success' : 'bg-muted-foreground/40',
                  )}
                />
                <span
                  className={cn(
                    'text-xs font-semibold uppercase tracking-widest',
                    product.isActive ? 'text-success' : 'text-muted-foreground',
                  )}
                >
                  {product.isActive ? 'Attivo' : 'Inattivo'}
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight leading-tight">
                {product.name}
              </h1>
              <p className="mt-1 font-mono text-xs text-muted-foreground/60 select-all">
                {product.id}
              </p>
              {product.description && (
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-2xl">
                  {product.description}
                </p>
              )}
            </div>

            {/* Actions */}
            {(canWrite || canDelete) && (
              <div className="flex shrink-0 gap-2">
                {canWrite && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/products/${productId}/edit`}>
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

          {/* Meta footer */}
          <div className="mt-4 flex items-center gap-6 border-t pt-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="font-medium">Creato</span>
              <span>{formatDate(product.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="font-medium">Aggiornato</span>
              <span>{formatDate(product.updatedAt)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs section */}
      {hasAnyTab && (
        <Tabs value={activeTab} onValueChange={handleTabChange} orientation="vertical">
          <div className="flex gap-4 items-start">
            {/* Vertical nav sidebar */}
            <TabsList className="flex h-auto w-52 flex-col items-stretch justify-start gap-0.5 rounded-xl border bg-muted/30 p-1.5 shrink-0">
              {canReadEnvironments && (
                <TabsTrigger value="environments" className={TAB_TRIGGER_CLASS}>
                  <Server className="h-4 w-4 shrink-0" />
                  Ambienti
                  <TabCount count={envCount} />
                </TabsTrigger>
              )}
              {canReadResources && (
                <TabsTrigger value="resources" className={TAB_TRIGGER_CLASS}>
                  <Box className="h-4 w-4 shrink-0" />
                  Risorse
                  <TabCount count={resourceCount} />
                </TabsTrigger>
              )}
              {canReadRunbooks && (
                <TabsTrigger value="runbooks" className={TAB_TRIGGER_CLASS}>
                  <BookOpen className="h-4 w-4 shrink-0" />
                  Runbook
                  <TabCount count={runbookCount} />
                </TabsTrigger>
              )}
              {canReadAlarms && (
                <TabsTrigger value="alarms" className={TAB_TRIGGER_CLASS}>
                  <Bell className="h-4 w-4 shrink-0" />
                  Allarmi
                  <TabCount count={alarmCount} />
                </TabsTrigger>
              )}
              {canReadIgnoredAlarms && (
                <TabsTrigger value="ignored-alarms" className={TAB_TRIGGER_CLASS}>
                  <BellOff className="h-4 w-4 shrink-0" />
                  Ignorati
                  <TabCount count={ignoredAlarmCount} />
                </TabsTrigger>
              )}
              {canReadDownstreams && (
                <TabsTrigger value="downstreams" className={TAB_TRIGGER_CLASS}>
                  <ArrowDownRight className="h-4 w-4 shrink-0" />
                  Downstream
                  <TabCount count={downstreamCount} />
                </TabsTrigger>
              )}
              {canReadFinalActions && (
                <TabsTrigger value="final-actions" className={TAB_TRIGGER_CLASS}>
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Azioni Finali
                  <TabCount count={finalActionCount} />
                </TabsTrigger>
              )}
            </TabsList>

            {/* Content panel — no redundant headers, tab components stand on their own */}
            <div className="flex-1 min-w-0">
              {canReadEnvironments && (
                <TabsContent value="environments" className="mt-0">
                  <div className="rounded-xl border bg-card p-5">
                    <EnvironmentsTab productId={productId} />
                  </div>
                </TabsContent>
              )}
              {canReadResources && (
                <TabsContent value="resources" className="mt-0">
                  <div className="rounded-xl border bg-card p-5">
                    <ResourcesTab productId={productId} />
                  </div>
                </TabsContent>
              )}
              {canReadRunbooks && (
                <TabsContent value="runbooks" className="mt-0">
                  <div className="rounded-xl border bg-card p-5">
                    <RunbooksTab productId={productId} />
                  </div>
                </TabsContent>
              )}
              {canReadAlarms && (
                <TabsContent value="alarms" className="mt-0">
                  <div className="rounded-xl border bg-card p-5">
                    <AlarmsTab productId={productId} />
                  </div>
                </TabsContent>
              )}
              {canReadIgnoredAlarms && (
                <TabsContent value="ignored-alarms" className="mt-0">
                  <div className="rounded-xl border bg-card p-5">
                    <IgnoredAlarmsTab productId={productId} />
                  </div>
                </TabsContent>
              )}
              {canReadDownstreams && (
                <TabsContent value="downstreams" className="mt-0">
                  <div className="rounded-xl border bg-card p-5">
                    <DownstreamsTab productId={productId} />
                  </div>
                </TabsContent>
              )}
              {canReadFinalActions && (
                <TabsContent value="final-actions" className="mt-0">
                  <div className="rounded-xl border bg-card p-5">
                    <FinalActionsTab productId={productId} />
                  </div>
                </TabsContent>
              )}
            </div>
          </div>
        </Tabs>
      )}

      {/* Delete confirmation */}
      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        description={`Sei sicuro di voler eliminare il prodotto "${product.name}"? Questa azione non può essere annullata.`}
        onConfirm={() => deleteMutation.mutate()}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}

export function ProductDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-5">
          <Skeleton className="h-5 w-40" />
          <div className="rounded-xl border p-6 space-y-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-4 w-full max-w-md" />
            <div className="flex gap-6 border-t pt-4">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-56 w-48 rounded-xl" />
            <Skeleton className="flex-1 h-56 rounded-xl" />
          </div>
        </div>
      }
    >
      <ProductDetailContent />
    </Suspense>
  )
}
