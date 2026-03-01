export const AnalysisSortFields = {
  ANALYSIS_DATE:  'analysisDate',
  FIRST_ALARM_AT: 'firstAlarmAt',
  LAST_ALARM_AT:  'lastAlarmAt',
  OCCURRENCES:    'occurrences',
  CREATED_AT:     'createdAt',
  UPDATED_AT:     'updatedAt',
} as const;

export type AnalysisSortField = typeof AnalysisSortFields[keyof typeof AnalysisSortFields];

export const ANALYSIS_SORT_FIELD_VALUES = Object.values(AnalysisSortFields) as [AnalysisSortField, ...AnalysisSortField[]];

export const SortDirections = {
  ASC:  'asc',
  DESC: 'desc',
} as const;

export type SortDirection = typeof SortDirections[keyof typeof SortDirections];

export const SORT_DIRECTION_VALUES = Object.values(SortDirections) as [SortDirection, ...SortDirection[]];
