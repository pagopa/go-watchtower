'use client'

import { useQuery } from '@tanstack/react-query'
import { api, type Product } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { usePermissions } from '@/hooks/use-permissions'

interface ReportPageWrapperProps {
  title: string
  description: string
  children: (products: Product[] | undefined) => React.ReactNode
}

export function ReportPageWrapper({ title, description, children }: ReportPageWrapperProps) {
  const { can, isLoading } = usePermissions()
  const canRead = isLoading || can('ALARM_ANALYSIS', 'read')

  const { data: products } = useQuery<Product[]>({
    queryKey: qk.products.list,
    queryFn: api.getProducts,
    enabled: canRead,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      {canRead && children(products)}
    </div>
  )
}
