import type { RunbookStatus } from '../constants/runbook-statuses.js';

export const RUNBOOK_STATUS_LABELS: Record<RunbookStatus, string> = {
  DRAFT:    'Bozza',
  COMPLETE: 'Completo',
};
