'use client'

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { qk } from '@/lib/query-keys'
import type { NewAlarmSignal } from '@/providers/notification-supervisor'

interface NewAlarmsBannerProps {
  signal: NewAlarmSignal
  onRefresh: () => void
}

/**
 * Inline banner shown between the Results Bar and the table when the
 * NotificationSupervisor detects new important alarms (on-call or high-priority).
 *
 * Actions:
 *  - "Aggiorna lista" — clears the signal and triggers a list refetch
 *  - X dismiss — clears the signal without refetching
 */
export function NewAlarmsBanner({ signal, onRefresh }: NewAlarmsBannerProps) {
  const queryClient = useQueryClient()

  const clearSignal = useCallback(() => {
    queryClient.setQueryData(qk.alarmEvents.newAlarmSignal, { count: 0, detectedAt: 0 })
  }, [queryClient])

  const handleRefresh = useCallback(() => {
    clearSignal()
    onRefresh()
  }, [clearSignal, onRefresh])

  const handleDismiss = useCallback(() => {
    clearSignal()
  }, [clearSignal])

  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-lg border border-amber-800/40 bg-amber-950/30 px-4 py-2.5 animate-in slide-in-from-top-2 fade-in duration-200"
    >
      {/* Left accent + icon */}
      <div className="flex items-center gap-2.5">
        <div className="h-5 w-0.5 rounded-full bg-amber-500" />
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
      </div>

      {/* Message */}
      <span className="flex-1 text-sm text-amber-200/90">
        <span className="font-mono font-semibold tabular-nums text-amber-400">{signal.count}</span>
        {' '}
        {signal.count === 1 ? 'nuovo allarme importante rilevato' : 'nuovi allarmi importanti rilevati'}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 border-amber-800/50 bg-amber-950/50 text-xs text-amber-300 hover:bg-amber-900/50 hover:text-amber-200"
          onClick={handleRefresh}
        >
          <RefreshCw className="h-3 w-3" />
          Aggiorna lista
        </Button>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-md p-1 text-amber-500/60 transition-colors hover:bg-amber-900/40 hover:text-amber-400"
          aria-label="Chiudi notifica"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
