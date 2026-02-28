import { Type, type Static } from "@sinclair/typebox";

export const PermissionScopeSchema = Type.Union([
  Type.Literal("NONE"),
  Type.Literal("OWN"),
  Type.Literal("ALL"),
]);

// Response schemas
export const ResourcePermissionSchema = Type.Object({
  canRead: PermissionScopeSchema,
  canWrite: PermissionScopeSchema,
  canDelete: PermissionScopeSchema,
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
