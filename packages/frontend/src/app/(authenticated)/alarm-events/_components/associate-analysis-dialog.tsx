'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Search, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { api, type AlarmEvent, type AlarmAnalysis } from '@/lib/api-client'
import { ANALYSIS_STATUS_LABELS } from '@go-watchtower/shared'
import {
  STATUS_ICONS,
} from '../../analyses/_helpers/cell-renderers'
import {
  ANALYSIS_STATUS_VARIANTS,
  formatDateTimeRome,
} from '../../analyses/_lib/constants'

interface AssociateAnalysisDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: AlarmEvent | null
  onAssociated: () => void
}

function AnalysisListItem({
  analysis,
  selected,
  onSelect,
}: {
  analysis: AlarmAnalysis
  selected: boolean
  onSelect: () => void
}) {
  const { Icon: StatusIcon, className: statusClassName } = STATUS_ICONS[analysis.status]

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
          : 'border-border/50 hover:bg-muted/40'
      )}
    >
      <StatusIcon className={cn('h-4 w-4 shrink-0', statusClassName)} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{analysis.alarm.name}</span>
          <Badge variant={ANALYSIS_STATUS_VARIANTS[analysis.status]} className="shrink-0 text-[10px] px-1.5 py-0">
            {ANALYSIS_STATUS_LABELS[analysis.status]}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono tabular-nums">{formatDateTimeRome(analysis.analysisDate)}</span>
          <span className="text-border">·</span>
          <span className="truncate">{analysis.environment.name}</span>
          <span className="text-border">·</span>
          <span>{analysis.operator.name}</span>
          <span className="text-border">·</span>
          <span className="tabular-nums">{analysis.occurrences} occ.</span>
        </div>
      </div>
      {selected && (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
      )}
    </button>
  )
}

function AnalysisListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-md border border-border/50 px-3 py-2.5">
          <Skeleton className="h-4 w-4 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function AssociateAnalysisDialog({
  open,
  onOpenChange,
  event,
  onAssociated,
}: AssociateAnalysisDialogProps) {
  const queryClient = useQueryClient()
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null)
  const [tab, setTab] = useState<'suggested' | 'all'>('suggested')
  const [searchQuery, setSearchQuery] = useState('')

  // Reset state when dialog opens/closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedAnalysisId(null)
      setTab('suggested')
      setSearchQuery('')
    }
    onOpenChange(isOpen)
  }

  // Suggested analyses: same product, environment, alarm (if linked)
  const suggestedQuery = useQuery({
    queryKey: ['analyses', 'suggested', event?.product.id, event?.environment.id, event?.alarmId],
    queryFn: () =>
      api.getAllAnalyses({
        productId: event!.product.id,
        environmentId: event!.environment.id,
        ...(event!.alarmId && { alarmId: event!.alarmId }),
        pageSize: 50,
        sortBy: 'analysisDate',
        sortOrder: 'desc',
      }),
    enabled: open && !!event,
  })

  // All analyses: same product and environment, no alarm/date filter
  const allQuery = useQuery({
    queryKey: ['analyses', 'all-for-event', event?.product.id, event?.environment.id],
    queryFn: () =>
      api.getAllAnalyses({
        productId: event!.product.id,
        environmentId: event!.environment.id,
        pageSize: 50,
        sortBy: 'analysisDate',
        sortOrder: 'desc',
      }),
    enabled: open && !!event && tab === 'all',
  })

  // Filter "all" tab by search query
  const filteredAllAnalyses = useMemo(() => {
    const items = allQuery.data?.data ?? []
    if (!searchQuery.trim()) return items
    const q = searchQuery.toLowerCase()
    return items.filter(
      (a) =>
        a.alarm.name.toLowerCase().includes(q) ||
        a.operator.name.toLowerCase().includes(q) ||
        a.environment.name.toLowerCase().includes(q)
    )
  }, [allQuery.data?.data, searchQuery])

  // Mutation for associating
  const associateMutation = useMutation({
    mutationFn: async () => {
      if (!event || !selectedAnalysisId) throw new Error('Missing data')
      // 1. Link the alarm event to the analysis
      await api.updateAlarmEvent(event.id, { analysisId: selectedAnalysisId })
      // 2. Increment occurrences on the analysis
      const allAnalyses = [...(suggestedQuery.data?.data ?? []), ...(allQuery.data?.data ?? [])]
      const analysis = allAnalyses.find((a) => a.id === selectedAnalysisId)
      if (analysis) {
        await api.updateAnalysis(analysis.productId, analysis.id, {
          occurrences: analysis.occurrences + 1,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith('alarm-events') })
      queryClient.invalidateQueries({ queryKey: ['analyses'] })
      toast.success('Evento associato all\'analisi')
      onAssociated()
      handleOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Errore durante l\'associazione')
    },
  })

  const suggestedAnalyses = suggestedQuery.data?.data ?? []

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-2xl flex flex-col">
        <DialogHeader>
          <DialogTitle>Associa ad analisi</DialogTitle>
          <DialogDescription>
            Seleziona un&apos;analisi esistente a cui associare questo evento.
          </DialogDescription>
        </DialogHeader>

        {/* Event summary */}
        {event && (
          <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2.5 space-y-0.5">
            <p className="text-sm font-medium truncate">{event.name}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono tabular-nums">
                {new Date(event.firedAt).toLocaleDateString('it-IT', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className="mx-1.5 text-border">·</span>
              <span className="font-medium">{event.product.name}</span>
              <span className="mx-1.5 text-border">·</span>
              {event.environment.name}
            </p>
          </div>
        )}

        {/* Tabs */}
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as 'suggested' | 'all')
            setSelectedAnalysisId(null)
          }}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="w-full">
            <TabsTrigger value="suggested" className="flex-1">
              Suggeriti
              {suggestedAnalyses.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-[10px] font-bold tabular-nums text-primary">
                  {suggestedAnalyses.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="all" className="flex-1">
              Tutte
            </TabsTrigger>
          </TabsList>

          {/* Suggested tab */}
          <TabsContent value="suggested" className="flex-1 overflow-y-auto min-h-0 max-h-[55vh] mt-3">
            {suggestedQuery.isLoading ? (
              <AnalysisListSkeleton />
            ) : suggestedAnalyses.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Search className="h-5 w-5 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nessuna analisi suggerita trovata.</p>
                <p className="text-xs text-muted-foreground/60">
                  Prova la tab &quot;Tutte&quot; per cercare tra tutte le analisi.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {suggestedAnalyses.map((analysis) => (
                  <AnalysisListItem
                    key={analysis.id}
                    analysis={analysis}
                    selected={selectedAnalysisId === analysis.id}
                    onSelect={() =>
                      setSelectedAnalysisId(
                        selectedAnalysisId === analysis.id ? null : analysis.id
                      )
                    }
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* All tab */}
          <TabsContent value="all" className="flex-1 flex flex-col min-h-0 mt-3">
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                placeholder="Cerca per allarme, operatore, ambiente..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
            <div className="flex-1 overflow-y-auto max-h-[50vh]">
              {allQuery.isLoading ? (
                <AnalysisListSkeleton />
              ) : filteredAllAnalyses.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Search className="h-5 w-5 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    {searchQuery.trim()
                      ? 'Nessuna analisi corrisponde alla ricerca.'
                      : 'Nessuna analisi trovata per questo prodotto/ambiente.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredAllAnalyses.map((analysis) => (
                    <AnalysisListItem
                      key={analysis.id}
                      analysis={analysis}
                      selected={selectedAnalysisId === analysis.id}
                      onSelect={() =>
                        setSelectedAnalysisId(
                          selectedAnalysisId === analysis.id ? null : analysis.id
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={associateMutation.isPending}
          >
            Annulla
          </Button>
          <Button
            onClick={() => associateMutation.mutate()}
            disabled={!selectedAnalysisId || associateMutation.isPending}
          >
            {associateMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Associa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
