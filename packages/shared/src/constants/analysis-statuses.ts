export const AnalysisStatuses = {
  CREATED:     'CREATED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED:   'COMPLETED',
} as const;

export type AnalysisStatus = typeof AnalysisStatuses[keyof typeof AnalysisStatuses];

export const ANALYSIS_STATUS_VALUES = Object.values(AnalysisStatuses) as [AnalysisStatus, ...AnalysisStatus[]];
