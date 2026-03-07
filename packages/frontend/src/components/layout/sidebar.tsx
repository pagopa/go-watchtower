'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Suspense } from 'react'
import {
  LayoutDashboard,
  Package,
  Users,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ClipboardList,
  FileBarChart,
  Shield,
  ScrollText,
  SlidersHorizontal,
  BanIcon,
  BellRing,
} from 'lucide-react'
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
import { useState, useCallback } from 'react'
import { api, type Product } from '@/lib/api-client'

interface NavItem {
  title: string
  href: string
  icon: React.ElementType
  resource?: string
  action?: 'read' | 'write' | 'delete'
  expandable?: boolean
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'Monitoraggio',
    items: [
      {
        title: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
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
        title: 'Allarmi scattati',
        href: '/alarm-events',
        icon: BellRing,
        resource: 'ALARM_EVENT',
        action: 'read',
      },
      {
        title: 'Report',
        href: '/reports',
        icon: FileBarChart,
        resource: 'ALARM_ANALYSIS',
        action: 'read',
      },
    ],
  },
  {
    label: 'Configurazione',
    items: [
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
    ],
  },
  {
    label: 'Sistema',
    items: [
      {
        title: 'Configurazioni',
        href: '/settings/parameters',
        icon: SlidersHorizontal,
        resource: 'SYSTEM_SETTING',
        action: 'read',
      },
      {
        title: 'Motivi esclusione',
        href: '/settings/ignore-reasons',
        icon: BanIcon,
        resource: 'SYSTEM_SETTING',
        action: 'write',
      },
      {
        title: 'Log eventi',
        href: '/settings/system-events',
        icon: ScrollText,
        resource: 'SYSTEM_SETTING',
        action: 'read',
      },
    ],
  },
]

function ProductSubNav({ products, pathname }: { products: Product[]; pathname: string }) {
  const searchParams = useSearchParams()
  return (
    <div className="ml-6 mt-1 space-y-0.5 border-l pl-3">
      {products.filter(p => p.isActive).map((product) => {
        const productHref = `/analyses?productId=${product.id}`
        const isProductActive =
          pathname === '/analyses' &&
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
  )
}

export function Sidebar() {
  const pathname = usePathname()
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

  const filterItems = (items: NavItem[]) =>
    items.filter((item) => {
      if (!item.resource || !item.action) return true
      if (isLoading) return true
      return can(item.resource as Parameters<typeof can>[0], item.action)
    })

  const renderItem = useCallback((item: NavItem) => {
    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
    const Icon = item.icon

    // Expandable item (Analisi with product sub-items)
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
              <Icon className="h-4 w-4 shrink-0" />
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
            <Suspense fallback={null}>
              <ProductSubNav products={products} pathname={pathname} />
            </Suspense>
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
        <Icon className="h-4 w-4 shrink-0" />
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
  }, [pathname, collapsed, analysisExpanded, products])

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'flex h-full flex-col border-r bg-sidebar transition-[width] duration-300',
          collapsed ? 'w-16' : 'w-56'
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b px-3">
          {!collapsed && (
            <span className="text-sm font-semibold text-sidebar-foreground tracking-wide uppercase">
              Watchtower
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            className={cn('h-7 w-7', collapsed && 'mx-auto')}
            aria-label={collapsed ? 'Espandi sidebar' : 'Comprimi sidebar'}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {navGroups.map((group) => {
            const visibleItems = filterItems(group.items)
            if (visibleItems.length === 0) return null

            return (
              <div key={group.label}>
                {/* Group label — hidden when collapsed */}
                {!collapsed && (
                  <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 select-none">
                    {group.label}
                  </p>
                )}
                {collapsed && (
                  <div className="mb-1 border-t border-sidebar-foreground/10" />
                )}
                <div className="space-y-0.5">
                  {visibleItems.map(renderItem)}
                </div>
              </div>
            )
          })}
        </nav>

        {/* Branding & version */}
        <div className="border-t border-sidebar-foreground/10 px-3 py-3">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col items-center gap-0.5 cursor-default">
                  <span className="font-[family-name:var(--font-cinzel)] text-sm font-bold tracking-tight text-sidebar-foreground/50">
                    W
                  </span>
                  <span className="text-[9px] font-mono text-sidebar-foreground/25">
                    {process.env.NEXT_PUBLIC_APP_VERSION}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="space-y-0.5">
                <p className="font-semibold">Watchtower</p>
                <p className="text-xs text-muted-foreground">
                  v{process.env.NEXT_PUBLIC_APP_VERSION} &middot; {process.env.NEXT_PUBLIC_BUILD_ID}
                </p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="select-none">
              <p className="font-[family-name:var(--font-cinzel)] text-[13px] font-bold tracking-wide text-sidebar-foreground/50">
                Watchtower
              </p>
              <p className="mt-0.5 text-[11px] text-sidebar-foreground/30">
                v{process.env.NEXT_PUBLIC_APP_VERSION}
                <span className="mx-1 text-sidebar-foreground/15">&middot;</span>
                <span className="font-mono text-[10px]">{process.env.NEXT_PUBLIC_BUILD_ID}</span>
              </p>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}
