import { api } from '@/lib/api-client'

export interface FkEntityOption {
  id:    string
  label: string
}

export interface FkResolver {
  queryKey: string[]
  fetch:    () => Promise<FkEntityOption[]>
}

export const FK_RESOLVERS: Partial<Record<string, FkResolver>> = {
  FK_ROLE: {
    queryKey: ['roles', 'fk-options'],
    fetch:    async () => {
      const roles = await api.getRoles()
      return roles.map((r) => ({ id: r.id, label: r.name }))
    },
  },
}
