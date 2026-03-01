export const PermissionScopes = {
  NONE: 'NONE',
  OWN:  'OWN',
  ALL:  'ALL',
} as const;

export type PermissionScope = typeof PermissionScopes[keyof typeof PermissionScopes];

export const PERMISSION_SCOPE_VALUES = Object.values(PermissionScopes) as [PermissionScope, ...PermissionScope[]];
