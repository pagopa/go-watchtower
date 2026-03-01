export const AnalysisTypes = {
  ANALYZABLE: 'ANALYZABLE',
  IGNORABLE:  'IGNORABLE',
} as const;

export type AnalysisType = typeof AnalysisTypes[keyof typeof AnalysisTypes];

export const ANALYSIS_TYPE_VALUES = Object.values(AnalysisTypes) as [AnalysisType, ...AnalysisType[]];
