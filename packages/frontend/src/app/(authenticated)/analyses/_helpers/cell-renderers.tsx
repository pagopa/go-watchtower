import { memo } from 'react'
import { Clock, Loader2, CheckCircle2, Search, Ban, type LucideIcon } from 'lucide-react'
import type { AlarmAnalysis, AnalysisType, AnalysisStatus } from '@/lib/api-client'
import {
  ANALYSIS_TYPE_LABELS,
  ANALYSIS_STATUS_LABELS,
  formatDateTimeRome,
  formatDateTimeUTC,
} from '../_lib/constants'

export const STATUS_ICONS: Record<AnalysisStatus, { Icon: LucideIcon; className: string }> = {
  CREATED:     { Icon: Clock,        className: 'text-slate-400 dark:text-slate-500' },
  IN_PROGRESS: { Icon: Loader2,      className: 'text-amber-500 dark:text-amber-400' },
  COMPLETED:   { Icon: CheckCircle2, className: 'text-emerald-500 dark:text-emerald-400' },
}

export const TYPE_ICONS: Record<AnalysisType, { Icon: LucideIcon; className: string }> = {
  ANALYZABLE: { Icon: Search, className: 'text-blue-500 dark:text-blue-400' },
  IGNORABLE:  { Icon: Ban,    className: 'text-amber-500/80 dark:text-amber-400/70' },
}

interface AnalysisCellProps {
  columnId: string
  analysis: AlarmAnalysis
}

export const AnalysisCell = memo(function AnalysisCell({ columnId, analysis }: AnalysisCellProps) {
  switch (columnId) {
    case 'analysisDate':
      return <span className="font-mono text-xs tabular-nums">{formatDateTimeRome(analysis.analysisDate)}</span>
    case 'product':
      return (
        <span className="inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium text-foreground/75">
          {analysis.product.name}
        </span>
      )
    case 'alarm':
      return <span className="block truncate font-medium text-sm">{analysis.alarm.name}</span>
    case 'environment':
      return <span className="block truncate text-sm text-muted-foreground">{analysis.environment.name}</span>
    case 'analysisType': {
      const { Icon, className } = TYPE_ICONS[analysis.analysisType]
      return (
        <span title={ANALYSIS_TYPE_LABELS[analysis.analysisType]} className="flex items-center">
          <Icon className={`h-4 w-4 ${className}`} />
        </span>
      )
    }
    case 'ignoreReason':
      return analysis.ignoreReason
        ? <span className="block truncate text-sm">{analysis.ignoreReason.label}</span>
        : <span className="text-muted-foreground/40 text-sm">—</span>
    case 'status': {
      const { Icon, className } = STATUS_ICONS[analysis.status]
      return (
        <span title={ANALYSIS_STATUS_LABELS[analysis.status]} className="flex items-center">
          <Icon className={`h-4 w-4 ${className}`} />
        </span>
      )
    }
    case 'operator':
      return <span className="block truncate text-sm">{analysis.operator.name}</span>
    case 'finalAction': {
      const names = analysis.finalActions.map(fa => fa.name)
      if (!names.length) return <span className="text-muted-foreground/40 text-sm">—</span>
      return <span className="block truncate text-sm">{names.join(', ')}</span>
    }
    case 'isOnCall':
      return (
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${analysis.isOnCall ? 'bg-emerald-500' : 'bg-muted-foreground/25'}`} />
          <span className="text-sm">{analysis.isOnCall ? 'Sì' : 'No'}</span>
        </span>
      )
    case 'occurrences':
      return <span className="tabular-nums font-medium text-sm">{analysis.occurrences}</span>
    case 'firstAlarmAt':
      return <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatDateTimeUTC(analysis.firstAlarmAt)}</span>
    case 'lastAlarmAt':
      return <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatDateTimeUTC(analysis.lastAlarmAt)}</span>
    case 'errorDetails':
      return <span className="block truncate text-sm text-muted-foreground">{analysis.errorDetails || '—'}</span>
    case 'conclusionNotes':
      return <span className="block truncate text-sm text-muted-foreground">{analysis.conclusionNotes || '—'}</span>
    case 'runbook':
      return analysis.runbook
        ? <span className="block truncate text-sm">{analysis.runbook.name}</span>
        : <span className="text-muted-foreground/40 text-sm">—</span>
    case 'resources': {
      const names = analysis.resources.map(m => m.name)
      if (!names.length) return <span className="text-muted-foreground/40 text-sm">—</span>
      return (
        <span className="flex flex-wrap gap-1">
          {names.map(name => (
            <span key={name} className="inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium text-foreground/75">
              {name}
            </span>
          ))}
        </span>
      )
    }
    case 'downstreams': {
      const names = analysis.downstreams.map(d => d.name)
      if (!names.length) return <span className="text-muted-foreground/40 text-sm">—</span>
      return (
        <span className="flex flex-wrap gap-1">
          {names.map(name => (
            <span key={name} className="inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium text-foreground/75">
              {name}
            </span>
          ))}
        </span>
      )
    }
    // 'validation' is rendered inline in the table row (not via AnalysisCell)
    default:
      return null
  }
})
