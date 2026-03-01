export const RunbookStatuses = {
  DRAFT:    'DRAFT',
  COMPLETE: 'COMPLETE',
} as const;

export type RunbookStatus = typeof RunbookStatuses[keyof typeof RunbookStatuses];

export const RUNBOOK_STATUS_VALUES = Object.values(RunbookStatuses) as [RunbookStatus, ...RunbookStatus[]];
