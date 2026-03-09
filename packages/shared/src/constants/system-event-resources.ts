// Identifica il tipo di entità coinvolta in un evento di sistema.
// I valori rispecchiano i nomi delle tabelle Prisma per coerenza.
export const SystemEventResources = {
  AUTH:                      'auth',
  USERS:                     'users',
  ALARM_ANALYSES:            'alarm_analyses',
  ALARM_EVENTS:              'alarm_events',
  SYSTEM_SETTINGS:           'system_settings',
  PRODUCTS:                  'products',
  ALARMS:                    'alarms',
  IGNORED_ALARMS:            'ignored_alarms',
  USER_PERMISSION_OVERRIDES: 'user_permission_overrides',
  ENVIRONMENTS:              'environments',
  RESOURCES:                 'resources',
  RUNBOOKS:                  'runbooks',
  FINAL_ACTIONS:             'final_actions',
  DOWNSTREAMS:               'downstreams',
  IGNORE_REASONS:            'ignore_reasons',
  ROLES:                     'roles',
} as const;

export type SystemEventResource = typeof SystemEventResources[keyof typeof SystemEventResources];
