import { Type, type Static } from "@sinclair/typebox";

// ============================================================================
// User Schemas
// ============================================================================

export const UserResponseSchema = Type.Object({
  id: Type.String(),
  email: Type.String(),
  name: Type.String(),
  roleName: Type.String(),
  provider: Type.String(),
  isActive: Type.Boolean(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

export const PermissionOverrideSchema = Type.Object({
  resource: Type.String(),
  canRead: Type.Union([Type.Boolean(), Type.Null()]),
  canWrite: Type.Union([Type.Boolean(), Type.Null()]),
  canDelete: Type.Union([Type.Boolean(), Type.Null()]),
  reason: Type.Union([Type.String(), Type.Null()]),
  grantedByUser: Type.Union([
    Type.Object({
      id: Type.String(),
      name: Type.String(),
      email: Type.String(),
    }),
    Type.Null(),
  ]),
});

export const RolePermissionSchema = Type.Object({
  resource: Type.String(),
  canRead: Type.Boolean(),
  canWrite: Type.Boolean(),
  canDelete: Type.Boolean(),
});

export const UserDetailResponseSchema = Type.Object({
  id: Type.String(),
  email: Type.String(),
  name: Type.String(),
  roleName: Type.String(),
  provider: Type.String(),
  isActive: Type.Boolean(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  permissionOverrides: Type.Array(PermissionOverrideSchema),
});

export const UserPermissionsResponseSchema = Type.Object({
  permissions: Type.Record(
    Type.String(),
    Type.Object({
      canRead: Type.Boolean(),
      canWrite: Type.Boolean(),
      canDelete: Type.Boolean(),
    })
  ),
  rolePermissions: Type.Array(RolePermissionSchema),
  overrides: Type.Array(PermissionOverrideSchema),
});

export const UsersResponseSchema = Type.Array(UserResponseSchema);

export const CreateUserBodySchema = Type.Object({
  email: Type.String({ format: "email" }),
  password: Type.String({ minLength: 6 }),
  name: Type.String({ minLength: 1, maxLength: 255 }),
  roleId: Type.Optional(Type.String()),
});

export type CreateUserBody = Static<typeof CreateUserBodySchema>;

export const UpdateUserBodySchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  email: Type.Optional(Type.String({ format: "email" })),
  isActive: Type.Optional(Type.Boolean()),
  roleId: Type.Optional(Type.String()),
});

export type UpdateUserBody = Static<typeof UpdateUserBodySchema>;

export const SetPermissionOverrideBodySchema = Type.Object({
  resource: Type.String(),
  canRead: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
  canWrite: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
  canDelete: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
  reason: Type.Optional(Type.String()),
});

export type SetPermissionOverrideBody = Static<typeof SetPermissionOverrideBodySchema>;

export const UserIdParamsSchema = Type.Object({
  id: Type.String(),
});

export type UserIdParams = Static<typeof UserIdParamsSchema>;

export const UserPermissionResourceParamsSchema = Type.Object({
  id: Type.String(),
  resource: Type.String(),
});

export type UserPermissionResourceParams = Static<typeof UserPermissionResourceParamsSchema>;

// ============================================================================
// User Preferences Schemas
// ============================================================================

export const ColumnSettingsSchema = Type.Object({
  visible: Type.Array(Type.String()),
  order: Type.Optional(Type.Array(Type.String())),
  widths: Type.Optional(Type.Record(Type.String(), Type.Number())),
});

export const UserPreferencesSchema = Type.Object({
  theme: Type.Optional(Type.Union([
    Type.Literal("light"),
    Type.Literal("dark"),
    Type.Literal("system"),
  ])),
  lastRoute: Type.Optional(Type.String()),
  columnSettings: Type.Optional(Type.Record(Type.String(), ColumnSettingsSchema)),
  savedFilters: Type.Optional(Type.Record(Type.String(), Type.Record(Type.String(), Type.Unknown()))),
  pageSize: Type.Optional(Type.Number()),
  locale: Type.Optional(Type.String()),
  sidebarCollapsed: Type.Optional(Type.Boolean()),
  analysisFiltersCollapsed: Type.Optional(Type.Boolean()),
});

export type UserPreferencesBody = Static<typeof UserPreferencesSchema>;

export const UserPreferencesResponseSchema = Type.Record(Type.String(), Type.Unknown());

// ============================================================================
// Role Schemas
// ============================================================================

export const RoleResponseSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  isDefault: Type.Boolean(),
  permissions: Type.Array(RolePermissionSchema),
  _count: Type.Object({
    users: Type.Number(),
  }),
});

export const RolesResponseSchema = Type.Array(RoleResponseSchema);

// ============================================================================
// Common Error Schemas (reused)
// ============================================================================

export const ErrorResponseSchema = Type.Object({
  error: Type.String(),
});

export const MessageResponseSchema = Type.Object({
  message: Type.String(),
});
