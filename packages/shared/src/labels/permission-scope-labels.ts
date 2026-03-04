import type { PermissionScope } from '../constants/permission-scopes.js';

export const PERMISSION_SCOPE_LABELS: Record<PermissionScope, string> = {
  NONE: 'Nessuno',
  OWN:  'Solo propri',
  ALL:  'Tutti',
};
