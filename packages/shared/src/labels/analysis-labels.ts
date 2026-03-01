import type { AnalysisType } from '../constants/analysis-types.js';
import type { AnalysisStatus } from '../constants/analysis-statuses.js';

export const ANALYSIS_TYPE_LABELS: Record<AnalysisType, string> = {
  ANALYZABLE: 'Analizzabile',
  IGNORABLE:  'Da ignorare',
};

export const ANALYSIS_STATUS_LABELS: Record<AnalysisStatus, string> = {
  CREATED:     'Creata',
  IN_PROGRESS: 'In corso',
  COMPLETED:   'Completata',
};
