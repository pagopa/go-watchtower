export const Resources = {
  PRODUCT:         'PRODUCT',
  ENVIRONMENT:     'ENVIRONMENT',
  RESOURCE:        'RESOURCE',
  IGNORED_ALARM:   'IGNORED_ALARM',
  RUNBOOK:         'RUNBOOK',
  FINAL_ACTION:    'FINAL_ACTION',
  ALARM:           'ALARM',
  ALARM_ANALYSIS:  'ALARM_ANALYSIS',
  ALARM_EVENT:     'ALARM_EVENT',
  DOWNSTREAM:      'DOWNSTREAM',
  USER:            'USER',
  SYSTEM_SETTING:  'SYSTEM_SETTING',
} as const;

export type Resource = typeof Resources[keyof typeof Resources];

export const RESOURCE_VALUES = Object.values(Resources) as [Resource, ...Resource[]];
