'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { startOfMonth } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { X } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePermissions } from '@/hooks/use-permissions'
import { api, type Product, type OperatorWorkloadItem, type AlarmRankingItem } from '@/lib/api-client'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

const OperatorWorkloadTab = dynamic(
  () => import('./_components/operator-workload-tab').then(m => m.OperatorWorkloadTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
)

const AlarmRankingTab = dynamic(
  () => import('./_components/alarm-ranking-tab').then(m => m.AlarmRankingTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
)

const MonthlyKpiTab = dynamic(
  () => import('./_components/monthly-kpi-tab').then(m => m.MonthlyKpiTab),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
)

const ALL_VALUE = '__all__'

export function ReportsPageContent() {
  const { can, isLoading: permissionsLoading } = usePermissions()
  const canReadAnalyses = permissionsLoading || can('ALARM_ANALYSIS', 'read')

  const [activeTab, setActiveTab] = useState<'operators' | 'alarms' | 'monthly-kpi'>('operators')
  const [selectedProductId, setSelectedProductId] = useState<string>('')
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: new Date(),
  })

  const filters = useMemo(() => {
    const f: Record<string, string> = {}
    if (selectedProductId) f.productId = selectedProductId
    if (dateRange?.from) f.dateFrom = dateRange.from.toISOString()
    if (dateRange?.to) f.dateTo = dateRange.to.toISOString()
    return f
  }, [selectedProductId, dateRange])

  const { data: products } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: api.getProducts,
    enabled: canReadAnalyses,
  })

  const { data: operatorData, isLoading: operatorLoading } = useQuery<OperatorWorkloadItem[]>({
    queryKey: ['report-operator-workload', filters],
    queryFn: () => api.getOperatorWorkload(filters),
    enabled: canReadAnalyses && activeTab === 'operators',
  })

  const { data: alarmData, isLoading: alarmLoading } = useQuery<AlarmRankingItem[]>({
    queryKey: ['report-alarm-ranking', filters],
    queryFn: () => api.getAlarmRanking(filters),
    enabled: canReadAnalyses && activeTab === 'alarms',
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Report</h1>
          <p className="text-muted-foreground">
            Report dettagliati su operatori e allarmi
          </p>
        </div>

        {canReadAnalyses && products && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Periodo</Label>
              <DateRangePicker value={dateRange} onChange={setDateRange} />
              {dateRange && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setDateRange(undefined)}
                  title="Tutti i periodi"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Prodotto</Label>
              <Select
                value={selectedProductId || ALL_VALUE}
                onValueChange={(val) => setSelectedProductId(val === ALL_VALUE ? '' : val)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>Tutti i prodotti</SelectItem>
                  {products.filter(p => p.isActive).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {canReadAnalyses && (
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'operators' | 'alarms' | 'monthly-kpi')} className="w-full">
          <TabsList>
            <TabsTrigger value="operators">Operatori</TabsTrigger>
            <TabsTrigger value="alarms">Allarmi</TabsTrigger>
            <TabsTrigger value="monthly-kpi">KPI Mensili</TabsTrigger>
          </TabsList>
          <TabsContent value="operators">
            <OperatorWorkloadTab data={operatorData} isLoading={operatorLoading} />
          </TabsContent>
          <TabsContent value="alarms">
            <AlarmRankingTab data={alarmData} isLoading={alarmLoading} />
          </TabsContent>
          <TabsContent value="monthly-kpi">
            <MonthlyKpiTab products={products} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
