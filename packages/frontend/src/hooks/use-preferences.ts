'use client'

import { useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/api-client'
import type { UserPreferences } from '@go-watchtower/shared'

export function usePreferences() {
  const { status } = useSession()
  const queryClient = useQueryClient()

  const { data: preferences, isLoading } = useQuery<UserPreferences>({
    queryKey: ['preferences:user'],
    queryFn: api.getMyPreferences,
    enabled: status === 'authenticated',
    staleTime: Infinity,
    retry: 1,
  })

  const { mutate } = useMutation({
    mutationFn: (data: Partial<UserPreferences>) => api.updateMyPreferences(data),
    onMutate: async (data) => {
      // Fire-and-forget: don't await so setQueryData runs synchronously.
      // This lets React 18 batch the optimistic update with any co-located
      // setState calls (e.g. setDragWidth) in the same event handler.
      // The race risk is negligible — staleTime is Infinity so the query
      // almost never refetches; onError reverts if it does.
      queryClient.cancelQueries({ queryKey: ['preferences:user'] })
      const previous = queryClient.getQueryData<UserPreferences>(['preferences:user'])
      queryClient.setQueryData<UserPreferences>(['preferences:user'], (old) => ({
        ...old,
        ...data,
      }))
      return { previous }
    },
    onError: (_err, _data, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['preferences:user'], context.previous)
      }
    },
  })

  const updatePreferences = useCallback(
    (data: Partial<UserPreferences>) => {
      if (status === 'authenticated') {
        mutate(data)
      }
    },
    [status, mutate]
  )

  const safePreferences = useMemo(() => preferences ?? {}, [preferences])

  return {
    preferences: safePreferences,
    isLoading,
    updatePreferences,
  }
}
