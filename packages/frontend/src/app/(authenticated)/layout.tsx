import { Suspense } from 'react'
import { Header } from '@/components/layout/header'
import { Sidebar } from '@/components/layout/sidebar'
import { EnvBanner } from '@/components/layout/env-banner'
import { RouteTracker } from '@/components/layout/route-tracker'
import { NotificationSupervisor } from '@/providers/notification-supervisor'
import { Skeleton } from '@/components/ui/skeleton'

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen flex-col">
      <EnvBanner />
      <NotificationSupervisor />
      <div className="flex flex-1 overflow-hidden">
        <RouteTracker />
        <Suspense fallback={<Skeleton className="h-full w-64" />}>
          <Sidebar />
        </Suspense>
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
