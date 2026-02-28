'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { LayoutDashboard, Package, Users, ChevronLeft, ChevronRight, ChevronDown, ClipboardList, FileBarChart, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { usePermissions } from '@/hooks/use-permissions'
import { usePreferences } from '@/hooks/use-preferences'
import { useState } from 'react'
import { api, type Product } from '@/lib/api-client'

interface NavItem {
  title: string
  href: string
  icon: React.ElementType
  resource?: string
  action?: 'read' | 'write' | 'delete'
  expandable?: boolean
}

const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Report',
    href: '/reports',
    icon: FileBarChart,
    resource: 'ALARM_ANALYSIS',
    action: 'read',
  },
  {
    title: 'Analisi',
    href: '/analyses',
    icon: ClipboardList,
    resource: 'ALARM_ANALYSIS',
    action: 'read',
    expandable: true,
  },
  {
    title: 'Prodotti',
    href: '/products',
    icon: Package,
    resource: 'PRODUCT',
    action: 'read',
  },
  {
    title: 'Utenti',
    href: '/users',
    icon: Users,
    resource: 'USER',
    action: 'read',
  },
  {
    title: 'Ruoli',
    href: '/roles',
    icon: Shield,
    resource: 'USER',
    action: 'write',
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { can, isLoading } = usePermissions()
  const { preferences, updatePreferences } = usePreferences()
  const collapsed = preferences.sidebarCollapsed ?? false
  const [analysisExpanded, setAnalysisExpanded] = useState(true)

  const toggleCollapsed = () => updatePreferences({ sidebarCollapsed: !collapsed })

  const canReadAnalyses = isLoading || can('ALARM_ANALYSIS', 'read')

  const { data: products } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: api.getProducts,
    enabled: canReadAnalyses,
  })

  const filteredNavItems = navItems.filter((item) => {
    if (!item.resource || !item.action) return true
    if (isLoading) return true
    return can(item.resource as Parameters<typeof can>[0], item.action)
  })

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'flex h-full flex-col border-r bg-sidebar transition-all duration-300',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className="flex h-16 items-center justify-between border-b px-4">
          {!collapsed && (
            <span className="text-lg font-semibold text-sidebar-foreground">
              Menu
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            className={cn('h-8 w-8', collapsed && 'mx-auto')}
            aria-label={collapsed ? 'Espandi sidebar' : 'Comprimi sidebar'}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {filteredNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
            const Icon = item.icon

            // Expandable item (Analisi)
            if (item.expandable && !collapsed) {
              return (
                <div key={item.href}>
                  <div className="flex items-center">
                    <Link
                      href={item.href}
                      className={cn(
                        'flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span>{item.title}</span>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setAnalysisExpanded(!analysisExpanded)}
                    >
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 transition-transform',
                          !analysisExpanded && '-rotate-90'
                        )}
                      />
                    </Button>
                  </div>
                  {analysisExpanded && products && products.length > 0 && (
                    <div className="ml-6 mt-1 space-y-0.5 border-l pl-3">
                      {products.filter(p => p.isActive).map((product) => {
                        const productHref = `/analyses?productId=${product.id}`
                        const isProductActive = pathname === '/analyses' &&
                          searchParams.get('productId') === product.id
                        return (
                          <Link
                            key={product.id}
                            href={productHref}
                            className={cn(
                              'block rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                              isProductActive
                                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                            )}
                          >
                            {product.name}
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            const linkContent = (
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  collapsed && 'justify-center px-2'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{item.title}</span>}
              </Link>
            )

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right">{item.title}</TooltipContent>
                </Tooltip>
              )
            }

            return <div key={item.href}>{linkContent}</div>
          })}
        </nav>
      </aside>
    </TooltipProvider>
  )
}
