import {
  ANALYSIS_TYPE_LABELS,
  ANALYSIS_STATUS_LABELS,
  formatDate,
  formatDateTime,
  formatDateTimeRome,
  formatDateTimeUTC,
  formatDateTimeDual,
} from '@go-watchtower/shared'
import type { AnalysisStatus, DualDateTime } from '@go-watchtower/shared'

export {
  ANALYSIS_TYPE_LABELS,
  ANALYSIS_STATUS_LABELS,
  formatDate,
  formatDateTime,
  formatDateTimeRome,
  formatDateTimeUTC,
  formatDateTimeDual,
}
export type { DualDateTime }

export const ANALYSIS_STATUS_VARIANTS: Record<AnalysisStatus, 'default' | 'secondary' | 'outline'> = {
  CREATED: 'outline',
  IN_PROGRESS: 'secondary',
  COMPLETED: 'default',
}
