import { useQuery } from '@tanstack/react-query'
import { FK_RESOLVERS } from '@/lib/fk-setting-resolvers'

export function useFkSettingLabel(format: string | null, value: unknown): string | null {
  const resolver = format !== null ? (FK_RESOLVERS[format] ?? null) : null

  const { data } = useQuery({
    queryKey:  resolver?.queryKey ?? ['__fk_noop__'],
    queryFn:   resolver?.fetch    ?? (() => Promise.resolve([])),
    enabled:   resolver !== null,
    staleTime: 5 * 60 * 1000,
  })

  if (!resolver || typeof value !== 'string') return null
  return data?.find((e) => e.id === value)?.label ?? null
}
