'use client'

import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { api, type UserPermissions } from '@/lib/api-client'

type Resource =
  | 'PRODUCT'
  | 'ENVIRONMENT'
  | 'MICROSERVICE'
  | 'IGNORED_ALARM'
  | 'RUNBOOK'
  | 'FINAL_ACTION'
  | 'ALARM'
  | 'ALARM_ANALYSIS'
  | 'DOWNSTREAM'
  | 'USER'

type Action = 'read' | 'write' | 'delete'

export function usePermissions() {
  const { status } = useSession()
  const {
    data: permissions,
    isLoading: queryLoading,
    error,
  } = useQuery<UserPermissions>({
    queryKey: ['permissions'],
    queryFn: api.getMyPermissions,
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: status === 'authenticated',
  })

  const can = useCallback(
    (resource: Resource, action: Action): boolean => {
      if (!permissions) return false
      const rp = permissions[resource]
      if (!rp) return false
      return action === 'read' ? rp.canRead : action === 'write' ? rp.canWrite : rp.canDelete
    },
    [permissions]
  )

  return {
    permissions,
    isLoading: status === 'loading' || queryLoading,
    error,
    can,
  }
}
