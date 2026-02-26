import { Type, type Static } from "@sinclair/typebox";

// Response schemas
export const ResourcePermissionSchema = Type.Object({
  canRead: Type.Boolean(),
  canWrite: Type.Boolean(),
  canDelete: Type.Boolean(),
});

export const PermissionsResponseSchema = Type.Object({
  permissions: Type.Record(Type.String(), ResourcePermissionSchema),
});

export const ErrorResponseSchema = Type.Object({
  error: Type.String(),
});

// Types
export type ResourcePermission = Static<typeof ResourcePermissionSchema>;
export type PermissionsResponse = Static<typeof PermissionsResponseSchema>;
