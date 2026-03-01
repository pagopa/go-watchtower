export interface AnalysisLink {
  url: string;
  name?: string;
  type?: string;
}

export interface TrackingEntry {
  traceId: string;
  errorCode?: string;
  errorDetail?: string;
  timestamp?: string;
}
