import { Type, type Static } from "@sinclair/typebox";
import { ErrorResponseSchema, PermissionScopeSchema } from "../../schemas/common.js";

export { ErrorResponseSchema, PermissionScopeSchema };

// Response schemas
export const ResourcePermissionSchema = Type.Object({
  canRead: PermissionScopeSchema,
  canWrite: PermissionScopeSchema,
  canDelete: PermissionScopeSchema,
});

export const PermissionsResponseSchema = Type.Object({
  permissions: Type.Record(Type.String(), ResourcePermissionSchema),
});

// Types
export type ResourcePermission = Static<typeof ResourcePermissionSchema>;
export type PermissionsResponse = Static<typeof PermissionsResponseSchema>;
