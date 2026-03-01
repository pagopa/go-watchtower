import type { PermissionScope } from '../constants/permission-scopes.js';

export interface ResourcePermission {
  canRead: PermissionScope;
  canWrite: PermissionScope;
  canDelete: PermissionScope;
}

export interface RolePermission extends ResourcePermission {
  resource: string;
}

export interface UserPermissions {
  [resource: string]: ResourcePermission;
}
