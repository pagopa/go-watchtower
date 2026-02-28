'use client'

import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { api, type UserPermissions, type PermissionScope } from '@/lib/api-client'

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

  /**
   * Get the raw PermissionScope for a resource/action.
   */
  const getScope = useCallback(
    (resource: Resource, action: Action): PermissionScope => {
      if (!permissions) return 'NONE'
      const rp = permissions[resource]
      if (!rp) return 'NONE'
      return action === 'read' ? rp.canRead : action === 'write' ? rp.canWrite : rp.canDelete
    },
    [permissions]
  )

  /**
   * Backward-compatible boolean check: true if scope is not NONE.
   */
  const can = useCallback(
    (resource: Resource, action: Action): boolean => {
      return getScope(resource, action) !== 'NONE'
    },
    [getScope]
  )

  /**
   * Scope-aware check for a specific resource instance.
   * - ALL: always true
   * - OWN: true only if ownerId === currentUserId
   * - NONE: always false
   */
  const canFor = useCallback(
    (resource: Resource, action: Action, ownerId: string, currentUserId: string | undefined): boolean => {
      const scope = getScope(resource, action)
      switch (scope) {
        case 'ALL':
          return true
        case 'OWN':
          return ownerId === currentUserId
        case 'NONE':
          return false
        default:
          return false
      }
    },
    [getScope]
  )

  return {
    permissions,
    isLoading: status === 'loading' || queryLoading,
    error,
    can,
    canFor,
    getScope,
  }
}
