export interface IgnoreReasonFieldDef {
  type: 'string' | 'number' | 'boolean';
  title: string;
  description?: string;
  minLength?: number;
  minimum?: number;
  enum?: string[];
  'x-ui'?: 'textarea';
  'x-enumLabels'?: string[];
}

export interface IgnoreReasonDetailsSchema {
  [key: string]: unknown;
  type: 'object';
  properties?: Record<string, IgnoreReasonFieldDef>;
  required?: string[];
}

export interface IgnoreReason {
  code: string;
  label: string;
  description: string | null;
  sortOrder: number;
  detailsSchema: IgnoreReasonDetailsSchema | null;
}
