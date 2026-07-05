'use client'

import { Bot, Filter, Hash, RadioTower } from 'lucide-react'
import { usePermissions } from '@/hooks/use-permissions'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OverviewTab } from './_components/overview-tab'
import { ControlTab } from './_components/control-tab'
import { ChannelsTab } from './_components/channels-tab'
import { CatalogTab } from './_components/catalog-tab'

export function SlackIngestorPageContent() {
  const { can, isLoading } = usePermissions()
  const canRead = can('SYSTEM_SETTING', 'read')
  const canWrite = can('SYSTEM_SETTING', 'write')

  if (isLoading) return <div className="p-6"><Skeleton className="h-96 w-full" /></div>
  if (!canRead) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        Non sei autorizzato a visualizzare il controllo dello Slack Ingestor.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-card">
          <RadioTower className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Slack Ingestor</h1>
          <p className="text-sm text-muted-foreground">
            Controllo dell&apos;importazione, scope delle execution e catalogo dei runbook automatici
          </p>
        </div>
      </div>
      <Tabs defaultValue="overview">
        <TabsList className="grid h-auto w-full grid-cols-2 lg:w-[720px] lg:grid-cols-4">
          <TabsTrigger value="overview"><RadioTower className="mr-2 h-4 w-4" />Overview</TabsTrigger>
          <TabsTrigger value="control"><Filter className="mr-2 h-4 w-4" />Controlli e regole</TabsTrigger>
          <TabsTrigger value="channels"><Hash className="mr-2 h-4 w-4" />Canali</TabsTrigger>
          <TabsTrigger value="catalog"><Bot className="mr-2 h-4 w-4" />Runbook automatici</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-5"><OverviewTab /></TabsContent>
        <TabsContent value="control" className="mt-5"><ControlTab canWrite={canWrite} /></TabsContent>
        <TabsContent value="channels" className="mt-5"><ChannelsTab canWrite={canWrite} /></TabsContent>
        <TabsContent value="catalog" className="mt-5"><CatalogTab canWrite={canWrite} /></TabsContent>
      </Tabs>
    </div>
  )
}
