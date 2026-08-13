import { Clock, Loader2, CheckCircle2, Search, Ban, type LucideIcon } from 'lucide-react'
import type { AnalysisType, AnalysisStatus } from '@/lib/api-client'

export const STATUS_ICONS: Record<AnalysisStatus, { Icon: LucideIcon; className: string }> = {
  CREATED:     { Icon: Clock,        className: 'text-slate-400 dark:text-slate-500' },
  IN_PROGRESS: { Icon: Loader2,      className: 'text-amber-500 dark:text-amber-400' },
  COMPLETED:   { Icon: CheckCircle2, className: 'text-emerald-500 dark:text-emerald-400' },
}

export const TYPE_ICONS: Record<AnalysisType, { Icon: LucideIcon; className: string }> = {
  ANALYZABLE: { Icon: Search, className: 'text-blue-500 dark:text-blue-400' },
  IGNORABLE:  { Icon: Ban,    className: 'text-amber-500/80 dark:text-amber-400/70' },
}
