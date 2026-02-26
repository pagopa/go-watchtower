'use client'

import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { api, type UserPreferences } from '@/lib/api-client'

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
      await queryClient.cancelQueries({ queryKey: ['preferences:user'] })
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

  return {
    preferences: preferences ?? {},
    isLoading,
    updatePreferences,
  }
}
