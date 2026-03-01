// Identifica il tipo di entità coinvolta in un evento di sistema.
// I valori rispecchiano i nomi delle tabelle Prisma per coerenza.
export const SystemEventResources = {
  AUTH:                      'auth',
  USERS:                     'users',
  ALARM_ANALYSES:            'alarm_analyses',
  SYSTEM_SETTINGS:           'system_settings',
  PRODUCTS:                  'products',
  ALARMS:                    'alarms',
  IGNORED_ALARMS:            'ignored_alarms',
  USER_PERMISSION_OVERRIDES: 'user_permission_overrides',
} as const;

export type SystemEventResource = typeof SystemEventResources[keyof typeof SystemEventResources];
