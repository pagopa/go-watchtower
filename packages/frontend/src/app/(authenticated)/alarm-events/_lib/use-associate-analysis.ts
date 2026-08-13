'use client'

import { useCallback, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { api, type AlarmEvent } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import { usePermissions } from '@/hooks/use-permissions'

/**
 * Loads the analyses an event can be linked to and tracks which one is picked.
 * Shared by the single-event and bulk associate dialogs, which query on the
 * same product / environment / alarm triple.
 */
export function useAssociableAnalyses(representative: AlarmEvent | null, open: boolean) {
  const { data: session } = useSession()
  const { getScope } = usePermissions()
  const currentUserId = session?.user?.id
  const ownOnly = getScope('ALARM_ANALYSIS', 'write') === 'OWN'

  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null)

  const query = useQuery({
    queryKey: qk.analyses.forLink(
      representative?.product.id ?? null,
      representative?.environment.id ?? null,
      representative?.alarmId ?? null,
      ownOnly ? currentUserId ?? null : null,
    ),
    staleTime: 0,
    queryFn: () => {
      const e = representative!
      const oneMonthAgo = new Date()
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
      return api.getAllAnalyses({
        productId: e.product.id,
        environmentId: e.environment.id,
        ...(e.alarmId && { alarmId: e.alarmId }),
        ...(ownOnly && currentUserId && { createdById: currentUserId }),
        dateFrom: oneMonthAgo.toISOString(),
        pageSize: 50,
        sortBy: 'analysisDate',
        sortOrder: 'desc',
      })
    },
    enabled: open && !!representative,
  })

  const analysesData = query.data?.data
  const analyses = useMemo(() => analysesData ?? [], [analysesData])

  const selectedAnalysis = useMemo(() => {
    if (!selectedAnalysisId) return null
    return analyses.find((a) => a.id === selectedAnalysisId) ?? null
  }, [selectedAnalysisId, analyses])

  return {
    ownOnly,
    query,
    analyses,
    selectedAnalysisId,
    setSelectedAnalysisId,
    selectedAnalysis,
  }
}

/**
 * The three association toggles both dialogs offer. They start on and reset
 * when the dialog closes.
 */
export function useAssociationOptions() {
  const [incrementOccurrences, setIncrementOccurrences] = useState(true)
  const [updateLastAlarmAt, setUpdateLastAlarmAt] = useState(true)
  const [reopenAnalysis, setReopenAnalysis] = useState(true)

  const reset = useCallback(() => {
    setIncrementOccurrences(true)
    setUpdateLastAlarmAt(true)
    setReopenAnalysis(true)
  }, [])

  return {
    incrementOccurrences,
    setIncrementOccurrences,
    updateLastAlarmAt,
    setUpdateLastAlarmAt,
    reopenAnalysis,
    setReopenAnalysis,
    reset,
  }
}
